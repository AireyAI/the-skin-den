import QRCode from "qrcode";

/**
 * Render a QR as an inline SVG data URI.
 *
 * The member page used to build its QR with api.qrserver.com, which meant the signed
 * door token travelled to a third party in a query string on every page load. We
 * render it here instead so the credential never leaves this origin.
 */
export async function qrSvgDataUri(text, { size = 240 } = {}) {
  const svg = await QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: size
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/** PNG data URI — Safari renders this reliably in <img> (SVG data URIs often show a blank box). */
export async function qrPngDataUri(text, { size = 240 } = {}) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size
  });
}
