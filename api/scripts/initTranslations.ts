/* istanbul ignore file */
import "reflect-metadata";
import texts from "./data/texts.js";
import Text from "../../model/Text.js";
import Language from "../../model/Language.js";
import Translation from "../../model/Translation.js";
import chalk from "chalk";
import { DataSource } from "typeorm";
import LogService from "#service/LogService.js";

/**
 * Initializes database (adds translations, languages, etc.)
 * @param silent If true, will not print any logs
 * @param appDataSource Data source to use
 */
export default async function(appDataSource: DataSource, logger: LogService, silent: boolean = true) {
  try {
    //if silent === false, print logs
    logger.info(chalk.yellow(`>>> Updating translations in database... (silent=${silent})`));
    //Languages
    const languageRepository = appDataSource.getRepository(Language);
    const textRepository = appDataSource.getRepository(Text);
    const translationRepository = appDataSource.getRepository(Translation);

    for (let i = 0; i < texts.length; i++) {
      const lang = texts[i];

      if(!silent) {
        logger.info(chalk.blue(`Processing ${lang.language} translations`));
      }

      //Check if language already exists and create if needed
      let language = await languageRepository.findOneBy({
        code: lang.languageCode,
      });
      if (!language) {
        if(!silent) {
          logger.info(
            `Language '${lang.language}' does not exists, creating...`,
          );
        }
        language = new Language();
        language.language = lang.language;
        language.code = lang.languageCode;
        await languageRepository.manager.save(language);
        if(!silent) {
          logger.info(chalk.green(`Created '${language.language}' language`));
        }
      }

      //Add translations
      for (const [textCode, textTranslation] of Object.entries(
        lang.textTranslations,
      )) {
        //Check if text already exists and create if needed
        let text = await textRepository.findOneBy({
          text: textCode,
        });
        if (!text) {
          if(!silent) {
            logger.info(`Text '${textCode}' does not exists, creating...`);
          }
          text = new Text();
          text.text = textCode;
          await textRepository.manager.save(text);
          if(!silent) {
            logger.info(chalk.green(`Created text '${textCode}'`));
          }
        }

        //Check if translation already exists and create if needed
        let translation = await translationRepository.findOneBy({
          text: {
            id: text.id,
          },
          language: {
            id: language.id,
          },
        });
        if (!translation) {
          translation = new Translation();
          translation.text = text;
          translation.language = language;
          translation.translation = textTranslation;
          translationRepository.manager.save(translation);

          if(!silent) {
            logger.info(
              chalk.green(
                `Created '${textTranslation}' transaltion for text '${translation.text.text}' 
                and language '${translation.language.language}'`,
              ),
            );
          }
        } else {
          if(!silent
          ) {
            logger.info(
              chalk.grey(
                `Skiped '${translation.translation}' transaltion for text '${text.text}' (already exists)`,
              ),
            );
          }
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
}
