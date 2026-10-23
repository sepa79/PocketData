package io.pockethive.pocketdata.mcp;

import io.modelcontextprotocol.server.transport.ServerTransportSecurityException;
import io.pockethive.templatedata.JsonDocumentReader;
import io.pockethive.templatedata.TemplateDataException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.filter.OncePerRequestFilter;

/** Responsibility: bound and validate MCP input before SDK parsing. Must not: dispatch tools or trust forwarded headers. Contract: docs/MCP.md; one MiB, strict JSON, Host/Origin validation. */
public final class McpBoundaryFilter extends OncePerRequestFilter {
    private final McpSecurity security;
    public McpBoundaryFilter(McpSecurity security) { this.security = security; }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        Map<String, List<String>> headers = new LinkedHashMap<>();
        for (String name : Collections.list(request.getHeaderNames())) headers.put(name, Collections.list(request.getHeaders(name)));
        try { security.validateHeaders(headers); }
        catch (ServerTransportSecurityException failure) { reject(response, failure.getStatusCode(), "MCP Host or Origin is not allowed."); return; }
        if (Collections.list(request.getHeaders("Authorization")).size() > 1) { reject(response, 400, "Invalid Authorization header."); return; }
        if (!request.getMethod().equals("POST")) { chain.doFilter(request, response); return; }
        if (request.getContentLengthLong() > 1024 * 1024) { reject(response, 413, "MCP request limit is 1 MiB."); return; }
        byte[] body = request.getInputStream().readNBytes(1024 * 1024 + 1);
        if (body.length > 1024 * 1024) { reject(response, 413, "MCP request limit is 1 MiB."); return; }
        try {
            if (!new JsonDocumentReader().read(body).isObject()) { reject(response, 400, "MCP requires one JSON object."); return; }
        } catch (TemplateDataException failure) { reject(response, 400, "MCP requires strict UTF-8 JSON."); return; }
        chain.doFilter(new McpBodyRequest(request, body), response);
    }
    private static void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
