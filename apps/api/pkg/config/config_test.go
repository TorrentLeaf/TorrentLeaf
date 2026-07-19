package config

import "testing"

// setValidBaseEnv sets the minimum required vars so Load() passes validate(),
// letting each case exercise only the TORRENT_TTL_HOURS branch.
func setValidBaseEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("REDIS_URL", "redis://x")
	t.Setenv("JWT_SECRET", "0123456789012345678901234567890123")
	t.Setenv("JWT_REFRESH_SECRET", "abcdefghijklmnopqrstuvwxyzabcdefghij")
}

func TestLoad_TTLHours(t *testing.T) {
	cases := []struct {
		name    string
		set     bool
		value   string
		want    int
		wantErr bool
	}{
		{name: "unset defaults to 72", set: false, want: 72},
		{name: "explicit value", set: true, value: "24", want: 24},
		{name: "zero disables", set: true, value: "0", want: 0},
		{name: "whitespace trimmed", set: true, value: " 0 ", want: 0},
		{name: "non-numeric errors", set: true, value: "off", wantErr: true},
		{name: "negative errors", set: true, value: "-5", wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			setValidBaseEnv(t)
			if tc.set {
				t.Setenv("TORRENT_TTL_HOURS", tc.value)
			}
			cfg, err := Load()
			if tc.wantErr {
				if err == nil {
					t.Fatalf("want error for %q, got nil", tc.value)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if cfg.TorrentTTLHours != tc.want {
				t.Fatalf("want TorrentTTLHours=%d, got %d", tc.want, cfg.TorrentTTLHours)
			}
		})
	}
}
