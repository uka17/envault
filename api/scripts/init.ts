import "reflect-metadata";
import appDataSource from "../src/model/dataSource";
import texts from "./data/texts";
import { Text } from "../src/model/Text";
import { Language } from "../src/model/Language";
import { TextLanguage } from "../src/model/TextLanguage";
import chalk from "chalk";

appDataSource
  .initialize()
  .then(async () => {
    //Languages
    const languageRepository = appDataSource.getRepository(Language);
    const textRepository = appDataSource.getRepository(Text);
    const textLanguageRepository = appDataSource.getRepository(TextLanguage);

    for (let i = 0; i < texts.length; i++) {
      const lang = texts[i];

      console.log(chalk.blue(`Processing ${lang.language} translations`));

      //Check if language already exists and create if needed
      let language = await languageRepository.findOneBy({
        code: lang.languageCode,
      });
      if (!language) {
        console.log(`Language '${lang.language}' does not exists, creating...`);
        language = new Language();
        language.language = lang.language;
        language.code = lang.languageCode;
        await languageRepository.manager.save(language);
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
          console.log(`Text '${textCode}' does not exists, creating...`);
          text = new Text();
          text.text = textCode;
          await textRepository.manager.save(text);
          console.log(chalk.green(`Created text '${textCode}'`));
        }

        //Check if text already exists and create if needed
        let translation = await textLanguageRepository.findOneBy({
          text: text,
          language: language,
        });
        if (!translation) {
          translation = new TextLanguage();
          translation.text = text;
          translation.language = language;
          translation.translation = textTranslation;
          textLanguageRepository.manager.save(translation);

          console.log(
            chalk.green(
              `Created '${textTranslation}' transaltion for text '${translation.text.text} and language '${translation.language.language}'`
            )
          );
        } else {
          console.log(
            chalk.grey(
              `Skiped '${translation.translation}' transaltion for text '${text.text}' (already exists)`
            )
          );
        }
      }
    }
  })
  .catch((error) => console.error(error));
