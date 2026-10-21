package io.pockethive.pocketdata;

/** Responsibility: own one in-process population job's state and counters. Must not: execute requests, write inventory or retry work. Contract: docs/POPULATION.md. */
final class PopulationJob {
    private final String id;
    private final String sut;
    private final String dataset;
    private final int total;
    private PopulationStatus status = PopulationStatus.RUNNING;
    private int completed;
    private int published;
    private int iteration;
    private String step = "";
    private String error = "";
    private boolean stop;
    PopulationJob(String id, String sut, String dataset, int total) { this.id = id; this.sut = sut; this.dataset = dataset; this.total = total; }
    boolean belongsTo(String selectedSut, String selectedDataset) { return sut.equals(selectedSut) && dataset.equals(selectedDataset); }
    synchronized PopulationSnapshot snapshot() { return new PopulationSnapshot(id, status, total, completed, published, iteration, step, error, id); }
    synchronized boolean finished() { return status == PopulationStatus.SUCCEEDED || status == PopulationStatus.FAILED || status == PopulationStatus.STOPPED; }
    synchronized boolean stopped() { return stop; }
    synchronized void stop() { if (!finished()) { stop = true; status = PopulationStatus.STOPPING; } }
    synchronized void working(int current, String currentStep) { iteration = current; step = currentStep; }
    synchronized void completed() { completed++; }
    synchronized void published() { published++; }
    synchronized void fail(String message) { error = message; status = PopulationStatus.FAILED; }
    synchronized void finish() {
        if (completed == total && published == total) status = PopulationStatus.SUCCEEDED;
        else if (stop) status = PopulationStatus.STOPPED;
        else fail("Population ended without completing every record. Inspect inventory and the SUT before repeating.");
    }
}
