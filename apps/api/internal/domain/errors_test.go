package domain

import (
	"errors"
	"testing"
)

func TestError_MessageWithoutWrapped(t *testing.T) {
	e := NewError(ErrNotFound, "torrent not found", nil)
	if got, want := e.Error(), "not_found: torrent not found"; got != want {
		t.Fatalf("Error() = %q, want %q", got, want)
	}
	if e.Code != ErrNotFound {
		t.Fatalf("Code = %q, want %q", e.Code, ErrNotFound)
	}
	if e.Unwrap() != nil {
		t.Fatalf("Unwrap() = %v, want nil", e.Unwrap())
	}
}

func TestError_MessageWithWrapped(t *testing.T) {
	cause := errors.New("boom")
	e := NewError(ErrInternal, "failed", cause)
	if got, want := e.Error(), "internal: failed: boom"; got != want {
		t.Fatalf("Error() = %q, want %q", got, want)
	}
	if !errors.Is(e, cause) {
		t.Fatal("errors.Is should find the wrapped cause")
	}
}

func TestError_AsAndUnwrap(t *testing.T) {
	cause := errors.New("db down")
	var wrapped error = NewError(ErrUnavailable, "engine", cause)
	var de *Error
	if !errors.As(wrapped, &de) {
		t.Fatal("errors.As should extract *Error")
	}
	if de.Code != ErrUnavailable {
		t.Fatalf("Code = %q, want %q", de.Code, ErrUnavailable)
	}
	if de.Unwrap() != cause {
		t.Fatalf("Unwrap() = %v, want %v", de.Unwrap(), cause)
	}
}
