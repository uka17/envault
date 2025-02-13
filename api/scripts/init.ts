import "reflect-metadata";
import texts from "./data/texts";
import { Text } from "../../model/Text";
import { Language } from "../../model/Language";
import { Translation } from "../../model/Translation";
import chalk from "chalk";
import config from "../src/config/config";
import { DataSource } from "typeorm";

/**
 * Initializes database (adds translations, languages, etc.)
 * @param silent If true, will not print any logs
 * @param appDataSource Data source to use
 */
async function initDB(appDataSource: DataSource, silent: boolean = true) {
  try {
    //if silent === false, print logs
    console.log(chalk.yellow(`>>>Initializing database... (silent=${silent})`));
    //Languages
    const languageRepository = appDataSource.getRepository(Language);
    const textRepository = appDataSource.getRepository(Text);
    const translationRepository = appDataSource.getRepository(Translation);

    for (let i = 0; i < texts.length; i++) {
      const lang = texts[i];

      !silent &&
        console.log(chalk.blue(`Processing ${lang.language} translations`));

      //Check if language already exists and create if needed
      let language = await languageRepository.findOneBy({
        code: lang.languageCode,
      });
      if (!language) {
        !silent &&
          console.log(
            `Language '${lang.language}' does not exists, creating...`
          );
        language = new Language();
        language.language = lang.language;
        language.code = lang.languageCode;
        await languageRepository.manager.save(language);
        !silent &&
          console.log(chalk.green(`Created '${language.language}' language`));
      }

      //Add translations
      for (const [textCode, textTranslation] of Object.entries(
        lang.textTranslations
      )) {
        //Check if text already exists and create if needed
        let text = await textRepository.findOneBy({
          text: textCode,
        });
        if (!text) {
          !silent &&
            console.log(`Text '${textCode}' does not exists, creating...`);
          text = new Text();
          text.text = textCode;
          await textRepository.manager.save(text);
          !silent && console.log(chalk.green(`Created text '${textCode}'`));
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

          !silent &&
            console.log(
              chalk.green(
                `Created '${textTranslation}' transaltion for text '${translation.text.text}' and language '${translation.language.language}'`
              )
            );
        } else {
          !silent &&
            console.log(
              chalk.grey(
                `Skiped '${translation.translation}' transaltion for text '${text.text}' (already exists)`
              )
            );
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
}

export default initDB;
