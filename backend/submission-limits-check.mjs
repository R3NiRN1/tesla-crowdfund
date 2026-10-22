import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

import { createRepository, setRepositoryForTests } from "./repository.mjs";
import { appendAudit, createSubmission, updateSubmission, updateSubmissionStatus } from "./store.mjs";

export async function runSubmissionLimitsChecks(repository, concurrentRepository = repository) {
  setRepositoryForTests(repository);
  const failures = [];
  async function check(name, work) {
    try { await work(); console.log(`PASS submission limits: ${name}`); }
    catch (error) { failures.push(error); console.error(`FAIL submission limits: ${name}: ${error.message}`); }
  }
  const creatorAddress = `0x${randomUUID().replaceAll("-", "")}12345678`;
  const draft = await createSubmission({ creatorAddress, title: "Draft" });
  await check("incomplete drafts remain editable and cannot enter review", async () => {
    assert.equal(draft.readiness.state, "incomplete");
    const partial = await updateSubmission(draft.id, { contractInput: { goal: "0", milestoneAmounts: ["1"] }, media: [null] });
    assert.equal(partial.readiness.state, "incomplete");
    await assert.rejects(updateSubmissionStatus(draft.id, "pending_review"), { code: "submission-not-contract-ready" });
  });

  const invalid = [
    ["940k title", { title: "x".repeat(940_000) }],
    ["untrimmed title", { title: " ".repeat(121) }],
    ["short description", { shortDescription: "x".repeat(281) }],
    ["long description", { longDescription: "x".repeat(10_001) }],
    ["image URL", { imageUrl: "x".repeat(1025) }],
    ["metadata URI", { metadataURI: "x".repeat(513) }],
    ["metadata alias", { metadataUri: "x".repeat(513) }],
    ["creator address", { creatorAddress: "x".repeat(43) }],
    ["nested description", { contractInput: { description: "x".repeat(2001) } }],
    ["numeric text", { contractInput: { goal: "1".repeat(79) } }],
    ["duration text", { contractInput: { duration: "1".repeat(79) } }],
    ["milestone text", { contractInput: { milestoneDescriptions: ["x".repeat(281)] } }],
    ["milestone amount", { contractInput: { milestoneAmounts: ["1".repeat(79)] } }],
    ["milestone count", { contractInput: { milestoneDescriptions: Array(65).fill("ok") } }],
    ["amount count", { contractInput: { milestoneAmounts: Array(65).fill("1") } }],
    ["media count", { media: Array(9).fill(null) }],
    ["media ID", { media: [{ id: "x".repeat(129) }] }],
    ["media URI", { media: [{ uri: "x".repeat(1025) }] }],
    ["media kind", { media: [{ kind: "x".repeat(17) }] }],
    ["media label", { media: [{ label: "x".repeat(121) }] }],
    ["media alt text", { media: [{ altText: "x".repeat(281) }] }],
    ["unknown contract data", { contractInput: { extra: { data: "x".repeat(1000) } } }],
    ["unknown media data", { media: [{ extra: { data: "x".repeat(1000) } }] }],
    ["object title", { title: { data: "x".repeat(1000) } }],
    ["object goal", { contractInput: { goal: { data: "x".repeat(1000) } } }],
    ["object milestone", { contractInput: { milestoneDescriptions: [{ data: "x".repeat(1000) }] } }],
    ["object amount", { contractInput: { milestoneAmounts: [{ data: "x".repeat(1000) }] } }],
    ["non-array media", { media: { data: "x".repeat(1000) } }],
    ["non-object contract", { contractInput: ["x".repeat(1000)] }],
  ];
  for (const [name, payload] of invalid) {
    await check(`${name} rejected on create and update without persistence or audit`, async () => {
      const before = await repository.read();
      for (const operation of [() => createSubmission({ creatorAddress, ...payload }), () => updateSubmission(draft.id, payload)]) {
        await assert.rejects(operation(), (error) => error.statusCode === 400 && error.code === "submission-storage-limit");
        assert.deepEqual(await repository.read(), before);
      }
    });
  }
  await check("valid boundary values and readiness survive partial updates", async () => {
    const ready = await createSubmission({
      creatorAddress, title: "t".repeat(120), shortDescription: "s".repeat(280), longDescription: "l".repeat(10_000),
      metadataURI: "ipfs://" + "m".repeat(505),
      media: [{ id: "i".repeat(128), kind: "image", uri: "ipfs://" + "u".repeat(1017), label: "l".repeat(120), altText: "a".repeat(280), primary: true }],
      contractInput: { description: "d".repeat(2000), goal: "64", duration: "3600", milestoneDescriptions: Array(64).fill("m".repeat(280)), milestoneAmounts: Array(64).fill("1") },
    });
    assert.equal(ready.readiness.state, "contract-ready");
    const edited = await updateSubmission(ready.id, { title: "Edited title" });
    assert.deepEqual(edited.contractInput, ready.contractInput);
    assert.deepEqual(edited.media, ready.media);
    assert.equal(edited.readiness.state, "contract-ready");
    assert.ok(Buffer.byteLength(JSON.stringify(edited)) < 60_000);
  });
  const readyPayload = {
    creatorAddress, title: "Ready draft", shortDescription: "A valid bounded campaign description",
    metadataURI: "ipfs://ready-draft",
    contractInput: { description: "A valid bounded contract description", goal: "1", duration: "3600", milestoneDescriptions: ["Deliver"], milestoneAmounts: ["1"] },
  };
  for (const [name, status, patch] of [
    ["940k submit note", "pending_review", { submitNote: "x".repeat(940_000) }],
    ["submit note over boundary", "pending_review", { submitNote: "x".repeat(2001) }],
    ["object submit note", "pending_review", { submitNote: { data: "nested" } }],
    ["review note over boundary", "needs_changes", { review: { note: "x".repeat(2001) } }],
    ["verification note over boundary", "needs_changes", { verification: { note: "x".repeat(2001) } }],
    ["unknown review data", "needs_changes", { review: { extra: { data: "x".repeat(940_000) } } }],
    ["unknown verification data", "needs_changes", { verification: { extra: { data: "x".repeat(940_000) } } }],
    ["object review note", "needs_changes", { review: { note: { data: "nested" } } }],
    ["object verification note", "needs_changes", { verification: { note: { data: "nested" } } }],
    ["array review", "needs_changes", { review: ["unsupported"] }],
    ["array verification", "needs_changes", { verification: ["unsupported"] }],
    ["nested reviewer identity", "needs_changes", { review: { reviewerSubject: { data: "nested" } } }],
    ["nested verification identity", "needs_changes", { verification: { reviewerSubject: { data: "nested" } } }],
    ["oversized legacy reviewer address", "needs_changes", { review: { reviewerAddress: "x".repeat(43) } }],
    ["oversized legacy verifier address", "needs_changes", { verification: { reviewerAddress: "x".repeat(43) } }],
    ["oversized common field in status patch", "needs_changes", { title: "x".repeat(121) }],
  ]) {
    await check(`${name} rejected on transition without persistence or audit`, async () => {
      const ready = await createSubmission(readyPayload);
      if (status !== "pending_review") await updateSubmissionStatus(ready.id, "pending_review");
      const before = await repository.read();
      await assert.rejects(updateSubmissionStatus(ready.id, status, patch), (error) => error.statusCode === 400 && error.code === "submission-storage-limit");
      assert.deepEqual(await repository.read(), before);
    });
  }
  await check("2000-character transition notes and supported review fields persist", async () => {
    const ready = await createSubmission(readyPayload);
    const note = "n".repeat(2000);
    const submitted = await updateSubmissionStatus(ready.id, "pending_review", { submitNote: note, review: null });
    assert.equal(submitted.submitNote, note);
    const now = new Date().toISOString();
    const approved = await updateSubmissionStatus(ready.id, "approved", {
      review: { decision: "approved", note, reviewerOperatorId: randomUUID(), reviewerSubject: "reviewer", reviewerAddress: creatorAddress, reviewedAt: now },
      verification: { state: "manually_verified", note, reviewerOperatorId: randomUUID(), reviewerSubject: "reviewer", reviewerAddress: creatorAddress, verifiedAt: now },
    });
    assert.equal(approved.review.note, note);
    assert.equal(approved.verification.note, note);
    assert.equal((await concurrentRepository.read()).submissions.find((item) => item.id === ready.id).verification.note, note);
  });
  await check("transition guards retain precedence over note limits", async () => {
    const patch = { submitNote: "x".repeat(2001) };
    const before = await repository.read();
    await assert.rejects(updateSubmissionStatus(draft.id, "unknown", patch), { code: "invalid-submission-status" });
    await assert.rejects(updateSubmissionStatus(randomUUID(), "pending_review", patch), { code: "submission-not-found" });
    await assert.rejects(updateSubmissionStatus(draft.id, "needs_changes", patch), { code: "invalid-status-transition" });
    await assert.rejects(updateSubmissionStatus(draft.id, "pending_review", patch), { code: "submission-not-contract-ready" });
    assert.deepEqual(await repository.read(), before);
    const ready = await createSubmission(readyPayload);
    await updateSubmissionStatus(ready.id, "pending_review");
    const pending = await repository.read();
    await assert.rejects(updateSubmissionStatus(ready.id, "approved", patch), { code: "manual-verification-required" });
    assert.deepEqual(await repository.read(), pending);
  });
  for (const [name, legacy] of [
    ["oversized long description", { longDescription: "x".repeat(10_001) }],
    ["unsupported contract data", { contractInput: { ...readyPayload.contractInput, extra: { data: "unsupported" } } }],
    ["oversized review note", { review: { note: "x".repeat(2001) } }],
    ["unsupported verification data", { verification: { extra: { data: "unsupported" } } }],
  ]) {
    for (const operation of ["update", "transition"]) {
      await check(`legacy ${name} cannot survive a new ${operation}`, async () => {
        const ready = await createSubmission(readyPayload);
        await repository.transaction((store) => Object.assign(store.submissions.find((item) => item.id === ready.id), legacy));
        const before = await repository.read();
        assert.deepEqual(before.submissions.find((item) => item.id === ready.id)[Object.keys(legacy)[0]], Object.values(legacy)[0], "reads must not migrate legacy records");
        await assert.rejects(operation === "update"
          ? updateSubmission(ready.id, { title: "Unrelated edit" })
          : updateSubmissionStatus(ready.id, "pending_review"),
        (error) => error.statusCode === 400 && error.code === "submission-storage-limit");
        assert.deepEqual(await repository.read(), before);
      });
    }
  }
  await check("explicit correction of oversized legacy declared fields remains possible", async () => {
    const ready = await createSubmission(readyPayload);
    await repository.transaction((store) => { store.submissions.find((item) => item.id === ready.id).longDescription = "x".repeat(10_001); });
    const corrected = await updateSubmission(ready.id, { longDescription: "Corrected bounded description" });
    assert.equal(corrected.longDescription, "Corrected bounded description");
    assert.equal(corrected.readiness.state, "contract-ready");
  });
  await check("new audit fields have bounded strings, depth and collection sizes", async () => {
    const snapshot = await repository.read();
    await assert.rejects(repository.transaction((store) => appendAudit(store, "hostile.actor", {}, {
      kind: "x".repeat(1000), id: null,
    })), (error) => error.code === "invalid-audit-actor");
    assert.deepEqual(await repository.read(), snapshot, "unsupported actor kinds must roll back on every store");
    const event = await repository.transaction((store) => appendAudit(store, "x".repeat(1000), {
      title: "x".repeat(940_000), nested: { a: { b: { c: { payload: "x".repeat(940_000) } } } },
      values: Array(1000).fill("x".repeat(1000)),
    }, { kind: "system", id: "x".repeat(1000), extra: "x".repeat(940_000) }));
    assert.ok(Buffer.byteLength(JSON.stringify(event)) < 20_000);
    assert.ok(event.detail.title.length <= 256);
    assert.ok(event.detail.values.length <= 32);
  });
  await check("case-insensitive creator quota is atomic across concurrent writers", async () => {
    const address = `0x${randomUUID().replaceAll("-", "")}abcdef12`;
    // Alternating repository instances exercises PostgreSQL row locking, not just one JS queue.
    const operations = Array.from({ length: 103 }, (_, index) => {
      setRepositoryForTests(index % 2 ? concurrentRepository : repository);
      return createSubmission({ creatorAddress: index % 2 ? address.toUpperCase() : address, title: "Draft" });
    });
    const results = await Promise.allSettled(operations);
    setRepositoryForTests(repository);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 100);
    assert.equal(results.filter((item) => item.status === "rejected" && item.reason.code === "submission-creation-quota" && item.reason.statusCode === 429).length, 3);
    const state = await repository.read();
    const submissions = state.submissions.filter((item) => String(item.creatorAddress ?? "").toLowerCase() === address.toLowerCase());
    assert.equal(submissions.length, 100);
    assert.equal(state.auditLog.filter((entry) => entry.action === "submission.created" && submissions.some((item) => item.id === entry.detail.submissionId)).length, 100);
    await updateSubmission(submissions[0].id, { title: "Still editable" });
    await createSubmission({ creatorAddress: `0x${"9".repeat(40)}`, title: "Another creator" });
  });
  if (failures.length) throw new AggregateError(failures, `${failures.length} submission limits regressions failed`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tes-submission-limits-"));
  const repository = createRepository({ storageDriver: "file", file: path.join(directory, "store.json") });
  try {
    await repository.initialize();
    await runSubmissionLimitsChecks(repository);
    console.log("backend:submission-limits-check passed (actual file store)");
  } finally {
    await repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
