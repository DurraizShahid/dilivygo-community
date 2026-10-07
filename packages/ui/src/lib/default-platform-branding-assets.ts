import markForLightUiBackground from "@dilivygo/logos/logo_without_text_monochrome_dark.svg";
import markForDarkUiBackground from "@dilivygo/logos/logo_without_text_monochrome_light.svg";
import wordmarkForLightUiBackground from "@dilivygo/logos/logo_dark_with_text_monochrome.svg";
import wordmarkForDarkUiBackground from "@dilivygo/logos/logo_light_with_text_monochrome.svg";
import { svgImportUrl } from "./svg-import-url";

/**
 * Packaged platform mark (no wordmark) for light-colored app chrome — dark ink on light surfaces.
 * @see packages/logos
 */
export const DEFAULT_PLATFORM_LOGO_MARK_FOR_LIGHT_UI = svgImportUrl(markForLightUiBackground);

/**
 * Packaged platform mark for dark-colored app chrome — light ink on dark surfaces.
 * @see packages/logos
 */
export const DEFAULT_PLATFORM_LOGO_MARK_FOR_DARK_UI = svgImportUrl(markForDarkUiBackground);

/**
 * Full wordmark for light-colored backgrounds / light UI mode.
 * @see packages/logos
 */
export const DEFAULT_PLATFORM_WORDMARK_FOR_LIGHT_UI = svgImportUrl(wordmarkForLightUiBackground);

/**
 * Full wordmark for dark-colored backgrounds / dark UI mode.
 * @see packages/logos
 */
export const DEFAULT_PLATFORM_WORDMARK_FOR_DARK_UI = svgImportUrl(wordmarkForDarkUiBackground);

/** Browser tab default when no platform favicon or logo URL is configured. */
export const DEFAULT_PLATFORM_FAVICON_URL = DEFAULT_PLATFORM_LOGO_MARK_FOR_LIGHT_UI;
