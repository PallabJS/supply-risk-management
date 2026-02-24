import { ManualIngestionDemoService } from "./playground/manual-ingestion-demo-service.js";

async function main(): Promise<void> {
  const demoService = new ManualIngestionDemoService();
  const { summary, publishedRecords } = await demoService.runDemo();

  console.log("Ingestion summary:", summary);
  console.log(`Published records (recent ${publishedRecords.length}):`);
  console.log(JSON.stringify(publishedRecords, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
