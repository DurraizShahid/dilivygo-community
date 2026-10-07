'use strict';

const { z } = require('zod');

const SUPPORTED_LANGUAGES = [
  'en', 'ar', 'de', 'es', 'et', 'fa', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'ru', 'sw', 'tr', 'ur', 'zh',
];

const supportedLanguageSchema = z.enum(SUPPORTED_LANGUAGES);

const updateLanguageSettingsSchema = z.object({
  defaultLanguage: supportedLanguageSchema.optional(),
  locked: z.boolean().optional(),
});

module.exports = {
  SUPPORTED_LANGUAGES,
  supportedLanguageSchema,
  updateLanguageSettingsSchema,
};
