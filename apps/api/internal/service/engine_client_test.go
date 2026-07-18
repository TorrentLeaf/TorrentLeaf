package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newEngine(t *testing.T, handler http.HandlerFunc) EngineClient {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return NewEngineClient(srv.URL)
}

func TestEngineClient_Add(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/engine/torrents" {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"infoHash":"abc","name":"OP","ready":true,"peers":3}`))
	})
	st, err := c.Add(context.Background(), "magnet:?x", "manga", false)
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if st.InfoHash != "abc" || st.Peers != 3 {
		t.Fatalf("unexpected status %+v", st)
	}
}

func TestEngineClient_Add_SerializesReseed(t *testing.T) {
	var gotReseed bool
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			MagnetURI string `json:"magnetURI"`
			Reseed    bool   `json:"reseed"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotReseed = body.Reseed
		_, _ = w.Write([]byte(`{"infoHash":"abc","ready":false}`))
	})
	if _, err := c.Add(context.Background(), "magnet:?x", "", true); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if !gotReseed {
		t.Fatal("reseed=true should be serialized into the request body")
	}
}

func TestEngineClient_Add_TypedError(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"error":"not enough free disk space","code":"insufficient_disk"}`))
	})
	_, err := c.Add(context.Background(), "magnet:?x", "", false)
	var ae *EngineAddError
	if !errors.As(err, &ae) || ae.Code != "insufficient_disk" {
		t.Fatalf("want EngineAddError insufficient_disk, got %v", err)
	}
	if ae.Error() != "not enough free disk space" {
		t.Fatalf("Error() = %q", ae.Error())
	}
}

func TestEngineClient_Add_UntypedError(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = w.Write([]byte(`boom`))
	})
	_, err := c.Add(context.Background(), "magnet:?x", "", false)
	if err == nil || !strings.Contains(err.Error(), "500") {
		t.Fatalf("want plain 500 error, got %v", err)
	}
}

func TestEngineClient_AddFile(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			t.Errorf("want multipart, got %q", r.Header.Get("Content-Type"))
		}
		if r.URL.Query().Get("downloadPath") != "books" {
			t.Errorf("downloadPath not forwarded: %q", r.URL.RawQuery)
		}
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{"infoHash":"deadbeef","ready":false}`))
	})
	st, err := c.AddFile(context.Background(), []byte("d1:xe"), "books")
	if err != nil || st.InfoHash != "deadbeef" {
		t.Fatalf("AddFile got %+v err=%v", st, err)
	}
}

func TestEngineClient_AddFile_TypedError(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"error":"bad","code":"invalid_upload"}`))
	})
	_, err := c.AddFile(context.Background(), []byte("x"), "")
	var ae *EngineAddError
	if !errors.As(err, &ae) || ae.Code != "invalid_upload" {
		t.Fatalf("want invalid_upload, got %v", err)
	}
}

func TestEngineClient_List(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"infoHash":"a","progress":0.5},{"infoHash":"b"}]`))
	})
	out, err := c.List(context.Background())
	if err != nil || len(out) != 2 || out[0].Progress != 0.5 {
		t.Fatalf("List got %+v err=%v", out, err)
	}
}

func TestEngineClient_List_Error(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) })
	if _, err := c.List(context.Background()); err == nil {
		t.Fatal("want error on 503")
	}
}

func TestEngineClient_Health(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/engine/health" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	if err := c.Health(context.Background()); err != nil {
		t.Fatalf("Health: %v", err)
	}
}

func TestEngineClient_Health_Error(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) })
	if err := c.Health(context.Background()); err == nil {
		t.Fatal("want error on 503")
	}
}

func TestEngineClient_Remove_DestroyStore(t *testing.T) {
	var gotQuery string
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		w.WriteHeader(204)
	})
	if err := c.Remove(context.Background(), "abc", true); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	if gotQuery != "destroyStore=true" {
		t.Fatalf("want destroyStore=true query, got %q", gotQuery)
	}
}

func TestEngineClient_Remove(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Errorf("want DELETE, got %s", r.Method)
		}
		w.WriteHeader(204)
	})
	if err := c.Remove(context.Background(), "abc", false); err != nil {
		t.Fatalf("Remove: %v", err)
	}
}

func TestEngineClient_Remove_404Tolerated(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(404) })
	if err := c.Remove(context.Background(), "gone", false); err != nil {
		t.Fatalf("404 should be tolerated, got %v", err)
	}
}

func TestEngineClient_Remove_Error(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })
	if err := c.Remove(context.Background(), "x", false); err == nil {
		t.Fatal("want error on 500")
	}
}

func TestEngineClient_ListArchiveEntries(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"index":0,"name":"001.jpg","size":100,"mimeType":"image/jpeg"}]`))
	})
	entries, err := c.ListArchiveEntries(context.Background(), "abc", 0)
	if err != nil || len(entries) != 1 || entries[0].Name != "001.jpg" {
		t.Fatalf("entries=%+v err=%v", entries, err)
	}
}

func TestEngineClient_ListArchiveEntries_NotReady(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) })
	_, err := c.ListArchiveEntries(context.Background(), "abc", 0)
	if !errors.Is(err, ErrArchiveNotReady) {
		t.Fatalf("want ErrArchiveNotReady, got %v", err)
	}
}

func TestEngineClient_ListArchiveEntries_Error(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })
	if _, err := c.ListArchiveEntries(context.Background(), "abc", 0); err == nil {
		t.Fatal("want error on 500")
	}
}

func TestEngineClient_SetPriority(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/priority") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		w.WriteHeader(204)
	})
	if err := c.SetPriority(context.Background(), "abc", 0, 2); err != nil {
		t.Fatalf("SetPriority: %v", err)
	}
}

func TestEngineClient_SetPriority_Error(t *testing.T) {
	c := newEngine(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(400) })
	if err := c.SetPriority(context.Background(), "abc", 0, 2); err == nil {
		t.Fatal("want error on 400")
	}
}
