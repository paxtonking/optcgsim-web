// Effect System exports
export * from './types';
export * from './EffectEngine';
export * from './parser';
export * from './registry';

// Note: cardDefinitions.ts has been deprecated (renamed to cardDefinitions.reference.ts)
// Card effects are now stored in the database and loaded by CardLoaderService.
// The reference file is kept for historical purposes and as documentation.
