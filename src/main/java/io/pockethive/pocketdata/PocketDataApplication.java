package io.pockethive.pocketdata;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Responsibility: start the HTTP application. Must not: own domain state. Contract: docs/ARCHITECTURE.md. */
@SpringBootApplication
public class PocketDataApplication {
    public static void main(String[] args) { SpringApplication.run(PocketDataApplication.class, args); }
}
