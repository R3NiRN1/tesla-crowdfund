import { createRepository, setRepositoryForTests } from "../backend/repository.mjs";
import { OPERATOR_ROLES, provisionOperator, revokeOperatorCredential } from "../backend/operator-auth.mjs";

const [command, ...args] = process.argv.slice(2);
const repository = createRepository();
setRepositoryForTests(repository);
await repository.initialize();

try {
  if (command === "create") {
    const [subject, displayName = subject, rolesInput = OPERATOR_ROLES.join(",")] = args;
    const roles = rolesInput.split(",").map((value) => value.trim()).filter(Boolean);
    const result = await provisionOperator({ subject, displayName, roles });
    console.log(JSON.stringify({
      operator: result.operator,
      credential: result.credential,
      warning: "Store this credential in the hosting secret manager now; it will not be shown again.",
    }, null, 2));
  } else if (command === "revoke-credential") {
    const [credentialId] = args;
    if (!credentialId || !(await revokeOperatorCredential(credentialId))) throw new Error("credential not found or already revoked");
    console.log(`revoked operator credential ${credentialId}`);
  } else {
    throw new Error("usage: node scripts/operator.mjs create <subject> [display-name] [comma-separated-roles] | revoke-credential <credential-id>");
  }
} finally {
  await repository.close();
}
