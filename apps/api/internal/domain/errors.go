package domain

import "fmt"

type ErrCode string

const (
	ErrNotFound     ErrCode = "not_found"
	ErrUnauthorized ErrCode = "unauthorized"
	ErrForbidden    ErrCode = "forbidden"
	ErrConflict     ErrCode = "conflict"
	ErrInvalidInput ErrCode = "invalid_input"
	ErrInternal     ErrCode = "internal"
)

type Error struct {
	Code    ErrCode
	Message string
	Err     error
}

func (e *Error) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *Error) Unwrap() error { return e.Err }

func NewError(code ErrCode, message string, err error) *Error {
	return &Error{Code: code, Message: message, Err: err}
}
