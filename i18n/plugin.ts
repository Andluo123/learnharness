/**
 * THE next-intl Next.js plugin (zh-CN i18n wave): wires the request
 * config at i18n/request.ts into the App Router. Kept as a .ts module
 * (not inline in next.config.ts) so the config file stays readable and
 * the plugin can be swapped without touching build settings.
 */
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl;
