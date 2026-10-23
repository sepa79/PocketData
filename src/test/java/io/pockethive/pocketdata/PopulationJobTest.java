package io.pockethive.pocketdata;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class PopulationJobTest {
    private final PopulationPacing pacing = new PopulationPacing(PopulationPacingMode.DELAY, 1, PopulationTimeUnit.DAYS);

    @Test void achievedRateCountsOnlyPublishedFullIterationsIncludesWaitAndFreezesOnCompletion() {
        AtomicLong time = new AtomicLong(100);
        var job = new PopulationJob("job", "sut", "data", 2, pacing, time::get);
        assertEquals(0, job.snapshot().achievedPerSecond());
        job.completed(); job.published();
        time.addAndGet(TimeUnit.SECONDS.toNanos(2));
        assertEquals(.5, job.snapshot().achievedPerSecond());
        job.completed();
        assertEquals(.5, job.snapshot().achievedPerSecond());
        time.addAndGet(TimeUnit.SECONDS.toNanos(8));
        job.published(); job.finish();
        var finished = job.snapshot();
        assertEquals(PopulationStatus.SUCCEEDED, finished.status());
        assertEquals(.2, finished.achievedPerSecond());
        assertEquals(10_000, finished.elapsedMs());
        time.addAndGet(TimeUnit.DAYS.toNanos(1));
        assertEquals(finished, job.snapshot());
    }

    @Test void uncertainPublicationAndFailureDoNotCountAsAchievedIterations() {
        AtomicLong time = new AtomicLong();
        var job = new PopulationJob("job", "sut", "data", 2, pacing, time::get);
        job.completed();
        time.set(TimeUnit.SECONDS.toNanos(3)); job.fail("Uncertain publication");
        assertEquals(0, job.snapshot().achievedPerSecond());
        time.set(TimeUnit.DAYS.toNanos(2));
        assertEquals(3000, job.snapshot().elapsedMs());
    }

    @Test void stopWakesADaysLongWaitImmediatelyAndDoesNotWaitIfAlreadyStopped() {
        assertTimeoutPreemptively(Duration.ofSeconds(3), () -> {
            var job = new PopulationJob("job", "sut", "data", 2, pacing);
            try (var executor = Executors.newSingleThreadExecutor()) {
                var waiting = executor.submit(() -> { job.awaitNext(TimeUnit.DAYS.toNanos(2)); return true; });
                try {
                    while (!job.snapshot().waiting()) Thread.sleep(1);
                    assertTrue(job.snapshot().waitRemainingMs() > TimeUnit.DAYS.toMillis(1));
                    job.stop();
                    assertTrue(waiting.get(1, TimeUnit.SECONDS));
                    assertFalse(job.snapshot().waiting());
                    assertEquals(0, job.snapshot().waitRemainingMs());
                    job.awaitNext(TimeUnit.DAYS.toNanos(2));
                    job.finish();
                    assertEquals(PopulationStatus.STOPPED, job.snapshot().status());
                } finally { job.stop(); }
            }
        });
    }
}
