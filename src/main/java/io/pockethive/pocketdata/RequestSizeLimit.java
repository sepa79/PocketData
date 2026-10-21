package io.pockethive.pocketdata;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Responsibility: bound API request bodies before parsing. Must not: authorize requests or retry operations. Contract: docs/API.md. */
@Component
@Order(0)
public class RequestSizeLimit extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        long limit = request.getRequestURI().endsWith("/import") ? 25L * 1024 * 1024 : 1024 * 1024;
        if (request.getContentLengthLong() > limit) {
            response.setStatus(413); response.setContentType("application/json"); response.getWriter().write("{\"error\":\"Request body exceeds the endpoint limit.\"}"); return;
        }
        HttpServletRequestWrapper bounded = new HttpServletRequestWrapper(request) {
            private ServletInputStream stream;
            @Override public ServletInputStream getInputStream() throws IOException {
                if (stream != null) return stream;
                ServletInputStream source = request.getInputStream();
                stream = new ServletInputStream() {
                    private long consumed;
                    @Override public int read() throws IOException {
                        int value = source.read();
                        if (value >= 0 && ++consumed > limit) throw new ApiFailure(413, "Request body exceeds the endpoint limit.");
                        return value;
                    }
                    @Override public int read(byte[] buffer, int offset, int length) throws IOException {
                        int read = source.read(buffer, offset, (int) Math.min(length, limit - consumed + 1));
                        if (read > 0 && (consumed += read) > limit) throw new ApiFailure(413, "Request body exceeds the endpoint limit.");
                        return read;
                    }
                    @Override public boolean isFinished() { return source.isFinished(); }
                    @Override public boolean isReady() { return source.isReady(); }
                    @Override public void setReadListener(ReadListener listener) { source.setReadListener(listener); }
                };
                return stream;
            }
        };
        chain.doFilter(bounded, response);
    }
}
