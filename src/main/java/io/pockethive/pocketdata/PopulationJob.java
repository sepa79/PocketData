package io.pockethive.pocketdata;

import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;

/** Responsibility: own job state, cancellable waiting and elapsed-rate observations. Must not: execute requests, choose pacing policy, write inventory or retry work. Contract: docs/POPULATION.md. */
final class PopulationJob {
    private final String id;
    private final String sut;
    private final String dataset;
    private final int total;
    private final PopulationPacing pacing;
    private final LongSupplier clock;
    private final long startedNanos;
    private long finishedElapsedNanos;
    private boolean waiting;
    private long wakeNanos;
    private PopulationStatus status = PopulationStatus.RUNNING;
    private int completed;
    private int published;
    private int iteration;
    private String step = "";
    private String error = "";
    private boolean stop;
    PopulationJob(String id, String sut, String dataset, int total, PopulationPacing pacing) {
        this(id, sut, dataset, total, pacing, System::nanoTime);
    }
    PopulationJob(String id, String sut, String dataset, int total, PopulationPacing pacing, LongSupplier clock) {
        this.id = id; this.sut = sut; this.dataset = dataset; this.total = total;
        this.pacing = pacing; this.clock = clock; this.startedNanos = clock.getAsLong();
    }
    boolean belongsTo(String selectedSut, String selectedDataset) { return sut.equals(selectedSut) && dataset.equals(selectedDataset); }
    synchronized PopulationSnapshot snapshot() {
        long elapsed = finished() ? finishedElapsedNanos : Math.max(0, clock.getAsLong() - startedNanos);
        boolean awaiting = waiting && !stop && !finished();
        long remaining = awaiting ? Math.max(0, wakeNanos - clock.getAsLong()) : 0;
        return new PopulationSnapshot(id, status, total, completed, published, iteration, step, error, id,
            pacing, TimeUnit.NANOSECONDS.toMillis(elapsed), elapsed == 0 ? 0 : published * 1_000_000_000d / elapsed,
            awaiting, (remaining + 999_999) / 1_000_000);
    }
    synchronized boolean finished() { return status == PopulationStatus.SUCCEEDED || status == PopulationStatus.FAILED || status == PopulationStatus.STOPPED; }
    synchronized boolean stopped() { return stop; }
    synchronized void stop() { if (!finished()) { stop = true; status = PopulationStatus.STOPPING; notifyAll(); } }
    synchronized void awaitNext(long delayNanos) throws InterruptedException {
        if (stop || delayNanos <= 0) return;
        waiting = true;
        step = "";
        wakeNanos = clock.getAsLong() + delayNanos;
        try {
            long remaining;
            while (!stop && (remaining = wakeNanos - clock.getAsLong()) > 0)
                wait(remaining / 1_000_000, (int) (remaining % 1_000_000));
        } finally { waiting = false; }
    }
    synchronized void working(int current, String currentStep) { iteration = current; step = currentStep; }
    synchronized void completed() { completed++; }
    synchronized void published() { published++; }
    synchronized void fail(String message) { error = message; status = PopulationStatus.FAILED; finishedElapsedNanos = Math.max(0, clock.getAsLong() - startedNanos); }
    synchronized void finish() {
        if (completed == total && published == total) status = PopulationStatus.SUCCEEDED;
        else if (stop) status = PopulationStatus.STOPPED;
        else fail("Population ended without completing every record. Inspect inventory and the SUT before repeating.");
        finishedElapsedNanos = Math.max(0, clock.getAsLong() - startedNanos);
    }
}
