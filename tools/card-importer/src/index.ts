import { Command } from 'commander';
import { importCards } from './import-cards.js';
import { importTranslations } from './import-translations.js';

const program = new Command();

program
  .name('card-importer')
  .description('Import cards from Unity OPTCGSim assets')
  .version('0.1.0');

program
  .command('cards')
  .description('Import card images from StreamingAssets/Cards folder')
  .requiredOption('-p, --path <path>', 'Path to Unity StreamingAssets folder')
  .option('-o, --output <path>', 'Output directory for processed cards', './output')
  .action(async (options) => {
    await importCards(options.path, options.output);
  });

program
  .command('translations')
  .description('Import card text from TRANSLATION.txt')
  .requiredOption('-f, --file <path>', 'Path to TRANSLATION.txt file')
  .action(async (options) => {
    await importTranslations(options.file);
  });

program
  .command('all')
  .description('Import both cards and translations')
  .requiredOption('-p, --path <path>', 'Path to Unity StreamingAssets folder')
  .option('-o, --output <path>', 'Output directory for processed cards', './output')
  .action(async (options) => {
    const translationFile = `${options.path}/TRANSLATION.txt`;
    await importTranslations(translationFile);
    await importCards(options.path, options.output);
  });

program.parse();
