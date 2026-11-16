"use client";
/**
 * THE message-catalog context (zh-CN i18n wave): carries the ACTIVE
 * catalog to components through React context, with the ENGLISH catalog
 * as the context default.
 *
 * Why not rely on next-intl's provider alone: 79 render tests mount
 * components in isolation with react-dom/server and no provider. A bare
 * useTranslations() there throws MISSING_PROVIDER, which would break the
 * whole suite. A context whose DEFAULT is the English catalog makes the
 * provider optional: production renders through <I18nProvider> (active
 * locale), tests and any stray isolated render fall back to English —
 * which is exactly what the existing assertions expect.
 *
 * The translator itself is next-intl's own engine (createTranslator from
 * use-intl, re-exported by next-intl), so ICU plurals/interpolation and
 * nesting behave identically to the framework's hooks.
 */

import { createContext } from "react";
import type { AppLocale } from "./config.ts";
import en from "./messages/en.json";

export const CatalogContext = createContext<Record<string, unknown>>(en as Record<string, unknown>);
export const LocaleContext = createContext<AppLocale>("en");
