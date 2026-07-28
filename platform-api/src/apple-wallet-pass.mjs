import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PKPass } from "passkit-generator";
import { config } from "./config.mjs";
import { walletPassObjectKey, walletBarcodeForPass } from "./wallet-pass.mjs";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = join(apiRoot, "pass-template.pass");

function loadPem(envVal, fileEnv) {
  if (envVal?.includes("BEGIN")) return envVal;
  const path = process.env[fileEnv];
  if (path && existsSync(path)) return readFileSync(path, "utf8");
  return envVal || "";
}

export function isAppleWalletEnabled() {
  const typeId = config.applePassTypeId;
  const team = config.appleTeamId;
  const cert = loadPem(config.applePassCertPem, "APPLE_PASS_CERT_PATH");
  const key = loadPem(config.applePassKeyPem, "APPLE_PASS_KEY_PATH");
  const wwdr = loadPem(config.appleWwdrPem, "APPLE_WWDR_CERT_PATH");
  return !!(typeId && team && cert && key && wwdr);
}

function certificates() {
  return {
    wwdr: loadPem(config.appleWwdrPem, "APPLE_WWDR_CERT_PATH"),
    signerCert: loadPem(config.applePassCertPem, "APPLE_PASS_CERT_PATH"),
    signerKey: loadPem(config.applePassKeyPem, "APPLE_PASS_KEY_PATH"),
    signerKeyPassphrase: config.applePassKeyPassphrase || undefined
  };
}

function formatRenewal(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Build signed .pkpass — strip is art-only; all type lives in field rows below. */
export async function buildApplePkPass({ user, membership }) {
  const passKey = walletPassObjectKey(user, membership);
  const qrValue = walletBarcodeForPass({ user, membership });
  const memberName = user.name || membership?.name || "Member";

  const pass = await PKPass.from(
    {
      model: templateDir,
      certificates: certificates()
    },
    {
      serialNumber: `kk-${passKey}`,
      passTypeIdentifier: config.applePassTypeId,
      teamIdentifier: config.appleTeamId,
      organizationName: config.applePassOrgName || "Kettle Kulture",
      description: config.applePassDescription || "Kettle Kulture membership",
      logoText: config.applePassLogoText || "Kettle Kulture",
      backgroundColor: config.applePassBackgroundColor,
      foregroundColor: config.applePassForegroundColor,
      labelColor: config.applePassLabelColor
    }
  );

  pass.setBarcodes({
    message: qrValue,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1"
  });

  // No primaryFields — avoids overlay on strip art.

  pass.secondaryFields.push({
    key: "member",
    label: "Member",
    value: memberName,
    textAlignment: "PKTextAlignmentLeft"
  });

  if (!membership?.id) {
    pass.secondaryFields.push({
      key: "status",
      label: "Status",
      value: "Add a plan to check in",
      textAlignment: "PKTextAlignmentRight"
    });
    pass.auxiliaryFields.push({
      key: "pricing",
      label: "Plans",
      value: "kettlekulture.co.uk/pricing",
      textAlignment: "PKTextAlignmentLeft"
    });
  } else {
    if (membership.packCredits != null) {
      pass.secondaryFields.push({
        key: "classes",
        label: "Classes left",
        value: String(Math.max(0, membership.packCredits)),
        textAlignment: "PKTextAlignmentRight"
      });
    } else {
      pass.secondaryFields.push({
        key: "plan",
        label: "Plan",
        value: membership.plan || "Unlimited",
        textAlignment: "PKTextAlignmentRight"
      });
    }
    if (membership.renewalDate) {
      pass.auxiliaryFields.push({
        key: "renewal",
        label: "Renews",
        value: formatRenewal(membership.renewalDate),
        textAlignment: "PKTextAlignmentLeft"
      });
    }
    pass.auxiliaryFields.push({
      key: "checkin",
      label: "Check-in",
      value: "Scan QR at the door",
      textAlignment: "PKTextAlignmentRight"
    });
  }

  return pass.getAsBuffer();
}
