package io.pockethive.pocketdata;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/** Responsibility: map PocketData identity and device-session HTTP requests. Must not: own OAuth state or authorize edits independently. Contract: docs/API.md. */
@RestController
public final class SessionController {
    private final AuthService auth;
    private final DeviceSessionService devices;
    public SessionController(AuthService auth, DeviceSessionService devices) { this.auth = auth; this.devices = devices; }
    @GetMapping("/api/session") public SessionAccess session(@RequestHeader(value="Authorization", required=false) String authorization) { return auth.access(authorization); }
    @PostMapping("/api/session/device/start") public Object start() { return devices.start(); }
    @PostMapping("/api/session/device/poll") public Object poll(@RequestBody Map<String, String> body) { return devices.poll(body); }
    @PostMapping("/api/session/logout") public Object logout(@RequestHeader(value="Authorization", required=false) String authorization) { return devices.logout(authorization); }
}
