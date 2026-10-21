package io.pockethive.pocketdata;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.http.converter.HttpMessageNotReadableException;

/** Responsibility: map failures to safe HTTP responses. Must not: return exception internals. Contract: docs/API.md. */
@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler({org.springframework.web.servlet.NoHandlerFoundException.class, org.springframework.web.servlet.resource.NoResourceFoundException.class})
    ResponseEntity<?> missing(Exception failure) { return ResponseEntity.status(404).body(Map.of("error", "Not found.")); }
    @ExceptionHandler(ApiFailure.class)
    ResponseEntity<?> failure(ApiFailure failure) { return ResponseEntity.status(failure.status()).body(Map.of("error", failure.getMessage())); }
    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
    ResponseEntity<?> invalid(Exception failure) { return ResponseEntity.badRequest().body(Map.of("error", "Invalid request. Check required fields and types.")); }
    @ExceptionHandler(Exception.class)
    ResponseEntity<?> unexpected(Exception failure) { return ResponseEntity.internalServerError().body(Map.of("error", "Operation failed. No automatic retry was performed.")); }
}
