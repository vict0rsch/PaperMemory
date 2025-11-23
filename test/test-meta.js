import { expect } from "expect";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

describe("Meta Tests - CI Workflow Coverage", function () {
    // 1. Find all test files in the test directory
    const testDir = path.join(rootDir, "test");
    const allFiles = fs.readdirSync(testDir);
    const testFiles = allFiles.filter((file) => {
        // Only look for files starting with 'test-' and ending with '.js'
        if (!file.startsWith("test-") || !file.endsWith(".js")) return false;

        // Check if file is empty
        const filePath = path.join(testDir, file);
        const content = fs.readFileSync(filePath, "utf8");
        if (content.trim().length === 0) return false;

        // Check for ignore comment
        if (content.includes("//" + " test-meta:ignore")) return false;

        return true;
    });

    // 2. Read test.yml and find all listed files
    const workflowPath = path.join(rootDir, ".github/workflows/test.yml");
    const workflowContent = fs.readFileSync(workflowPath, "utf8");
    const workflow = YAML.parse(workflowContent);

    const listedFiles = new Set();

    // Extract files from the matrix strategy
    const matrixInclude = workflow.jobs["test-matrix"]?.strategy?.matrix?.include || [];
    matrixInclude.forEach((item) => {
        if (item.files) {
            item.files.split(" ").forEach((f) => listedFiles.add(f.trim()));
        }
    });

    // Extract files from other jobs (like test-storage)
    Object.values(workflow.jobs).forEach((job) => {
        // Skip the matrix job itself as we handled it above
        if (job === workflow.jobs["test-matrix"]) return;

        if (job.steps) {
            job.steps.forEach((step) => {
                if (step.with && step.with.command) {
                    const match = step.with.command.match(/npm run test:file\s+(.+)/);
                    if (match) {
                        match[1].split(" ").forEach((f) => listedFiles.add(f.trim()));
                    }
                }
            });
        }
    });

    // 3. Generate a test for each file
    testFiles.forEach((file) => {
        it(`should list ${file} in test.yml`, function () {
            const relativePath = `test/${file}`;
            if (!listedFiles.has(relativePath)) {
                throw new Error(
                    `${file} is not listed in .github/workflows/test.yml. Please add it to the workflow or add '// ` +
                        `test-meta:ignore' to the file.`
                );
            }
        });
    });
});
