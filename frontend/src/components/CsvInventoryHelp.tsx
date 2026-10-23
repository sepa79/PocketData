export function CsvInventoryHelp() {
  return <div>
    <p className="pd-muted">These files are stored on the PocketData server for the selected SUT and DataSet. PD reads the saved files to build this list.</p>
    <p className="pd-muted">They come from CSV imports or records created by Population, saved before publication to Redis. Files survive restarts and can be downloaded and imported again.</p>
    <p className="pd-muted"><strong>These are saved snapshots, not live Redis contents.</strong> Swarm activity does not update them. A saved file does not guarantee that every record reached Redis: a stopped or failed run may have published only some records.</p>
  </div>
}
