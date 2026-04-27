package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestForwardUnauthorized(t *testing.T) {
	assert := assert.New(t)
	plugin := Plugin{}
	plugin.router = plugin.initRouter()

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/v1/forward", bytes.NewReader([]byte("{}")))
	plugin.ServeHTTP(nil, w, r)

	res := w.Result()
	defer func() { _ = res.Body.Close() }()
	assert.Equal(http.StatusUnauthorized, res.StatusCode)
}

func TestForwardBadJSON(t *testing.T) {
	assert := assert.New(t)
	plugin := Plugin{}
	plugin.router = plugin.initRouter()

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/v1/forward", bytes.NewReader([]byte("not-json")))
	r.Header.Set("Mattermost-User-ID", "user-1")
	plugin.ServeHTTP(nil, w, r)

	res := w.Result()
	defer func() { _ = res.Body.Close() }()
	assert.Equal(http.StatusBadRequest, res.StatusCode)
}

func TestForwardMissingFields(t *testing.T) {
	assert := assert.New(t)
	plugin := Plugin{}
	plugin.router = plugin.initRouter()

	body, _ := json.Marshal(map[string]string{"post_id": "p1"})
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/v1/forward", bytes.NewReader(body))
	r.Header.Set("Mattermost-User-ID", "user-1")
	plugin.ServeHTTP(nil, w, r)

	res := w.Result()
	defer func() { _ = res.Body.Close() }()
	b, _ := io.ReadAll(res.Body)
	assert.Equal(http.StatusBadRequest, res.StatusCode, string(b))
}
