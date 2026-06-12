const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const MAX_UINT256 = (1n << 256n) - 1n;

export const READINESS = Object.freeze({
  INCOMPLETE: "incomplete",
  CONTRACT_READY: "contract-ready",
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function addReason(reasons, field, message) {
  reasons.push(`${field}: ${message}`);
}

function parsePositiveUint(value, field, reasons) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    addReason(reasons, field, "must be a safe integer or decimal string");
    return null;
  }

  const raw = typeof value === "bigint"
    ? value.toString()
    : typeof value === "number" || typeof value === "string"
      ? String(value).trim()
      : "";

  if (!/^\d+$/.test(raw)) {
    addReason(reasons, field, "must be a positive integer");
    return null;
  }

  const parsed = BigInt(raw);
  if (parsed <= 0n) {
    addReason(reasons, field, "must be greater than zero");
    return null;
  }

  if (parsed > MAX_UINT256) {
    addReason(reasons, field, "must fit within uint256");
    return null;
  }

  return parsed;
}

function validateMetadataURI(value, reasons) {
  const uri = text(value);
  if (!uri) {
    addReason(reasons, "metadataURI", "is required");
    return;
  }

  if (uri.length > 512) {
    addReason(reasons, "metadataURI", "must be 512 characters or fewer");
    return;
  }

  if (uri.startsWith("ipfs://")) {
    if (uri.length === "ipfs://".length) {
      addReason(reasons, "metadataURI", "must include an IPFS content identifier");
    }
    return;
  }

  try {
    const parsed = new URL(uri);
    if (!["https:", "ar:"].includes(parsed.protocol)) {
      addReason(reasons, "metadataURI", "must use ipfs://, https://, or ar://");
    }
  } catch {
    addReason(reasons, "metadataURI", "must be a valid ipfs://, https://, or ar:// URI");
  }
}

function validateMediaURI(value, field, reasons) {
  const uri = text(value);
  if (!uri) {
    addReason(reasons, field, "is required");
    return;
  }
  if (uri.length > 1024) {
    addReason(reasons, field, "must be 1024 characters or fewer");
    return;
  }
  if (uri.startsWith("ipfs://")) {
    if (uri.length === "ipfs://".length) addReason(reasons, field, "must include an IPFS content identifier");
    return;
  }
  try {
    const parsed = new URL(uri);
    if (!["https:", "ar:"].includes(parsed.protocol)) {
      addReason(reasons, field, "must use ipfs://, https://, or ar://");
    }
  } catch {
    addReason(reasons, field, "must be a valid ipfs://, https://, or ar:// URI");
  }
}

function validateMediaReferences(value, reasons) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    addReason(reasons, "media", "must be an array");
    return;
  }
  if (value.length > 8) addReason(reasons, "media", "must contain no more than 8 references");

  let primaryCount = 0;
  value.forEach((item, index) => {
    const media = item && typeof item === "object" ? item : {};
    if (!["image", "video", "document"].includes(media.kind)) {
      addReason(reasons, `media[${index}].kind`, "must be image, video, or document");
    }
    validateMediaURI(media.uri, `media[${index}].uri`, reasons);
    if (text(media.altText).length > 280) {
      addReason(reasons, `media[${index}].altText`, "must be 280 characters or fewer");
    }
    if (text(media.label).length > 120) {
      addReason(reasons, `media[${index}].label`, "must be 120 characters or fewer");
    }
    if (media.primary === true) {
      primaryCount += 1;
      if (media.kind !== "image") addReason(reasons, `media[${index}].primary`, "must identify an image");
    }
  });

  if (value.length > 0 && primaryCount !== 1) {
    addReason(reasons, "media", "must contain exactly one primary image reference");
  }
}

export function validateSubmission(submission, checkedAt = new Date().toISOString()) {
  const input = submission && typeof submission === "object" ? submission : {};
  const contractInput = input.contractInput && typeof input.contractInput === "object"
    ? input.contractInput
    : {};
  const reasons = [];

  const creatorAddress = text(input.creatorAddress);
  if (!ADDRESS_PATTERN.test(creatorAddress) || creatorAddress.toLowerCase() === ZERO_ADDRESS) {
    addReason(reasons, "creatorAddress", "must be a non-zero EVM address");
  }

  const title = text(input.title);
  if (title.length < 4 || title.length > 120) {
    addReason(reasons, "title", "must be between 4 and 120 characters");
  }

  const shortDescription = text(input.shortDescription);
  if (shortDescription.length < 20 || shortDescription.length > 280) {
    addReason(reasons, "shortDescription", "must be between 20 and 280 characters");
  }

  const description = text(contractInput.description);
  if (description.length < 20 || description.length > 2_000) {
    addReason(reasons, "contractInput.description", "must be between 20 and 2000 characters");
  }

  validateMetadataURI(input.metadataURI ?? input.metadataUri, reasons);
  validateMediaReferences(input.media, reasons);

  const goal = parsePositiveUint(contractInput.goal, "contractInput.goal", reasons);
  parsePositiveUint(contractInput.duration, "contractInput.duration", reasons);

  const descriptions = Array.isArray(contractInput.milestoneDescriptions)
    ? contractInput.milestoneDescriptions
    : [];
  const amounts = Array.isArray(contractInput.milestoneAmounts)
    ? contractInput.milestoneAmounts
    : [];

  if (descriptions.length === 0) {
    addReason(reasons, "contractInput.milestoneDescriptions", "must contain at least one milestone");
  }

  if (amounts.length === 0) {
    addReason(reasons, "contractInput.milestoneAmounts", "must contain at least one milestone amount");
  }

  if (descriptions.length !== amounts.length) {
    addReason(reasons, "contractInput.milestones", "descriptions and amounts must have the same length");
  }

  descriptions.forEach((descriptionValue, index) => {
    const milestone = text(descriptionValue);
    if (!milestone || milestone.length > 280) {
      addReason(reasons, `contractInput.milestoneDescriptions[${index}]`, "must be between 1 and 280 characters");
    }
  });

  let milestoneTotal = 0n;
  let allAmountsValid = amounts.length > 0;
  amounts.forEach((amountValue, index) => {
    const amount = parsePositiveUint(amountValue, `contractInput.milestoneAmounts[${index}]`, reasons);
    if (amount === null) {
      allAmountsValid = false;
    } else {
      milestoneTotal += amount;
    }
  });

  if (goal !== null && allAmountsValid && milestoneTotal !== goal) {
    addReason(reasons, "contractInput.milestoneAmounts", "must add up exactly to contractInput.goal");
  }

  return {
    state: reasons.length === 0 ? READINESS.CONTRACT_READY : READINESS.INCOMPLETE,
    reasons,
    checkedAt,
  };
}

export function withReadiness(submission) {
  return {
    ...submission,
    readiness: validateSubmission(submission),
  };
}
