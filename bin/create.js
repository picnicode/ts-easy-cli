const ora = require('ora');
const inquirer = require('inquirer');
const { promisify } = require('util');
const { downloadDirPath } = require('./const');
const path = require('path');
let DownloadGitRepo = require('download-git-repo');
const shell = require('shelljs');
const exec = promisify(shell.exec);
const rm = promisify(shell.rm);
const chalk = require('chalk');
const fs = require('fs');
const { render } = require('consolidate').ejs;
const Metalsmith = require('metalsmith');
const updateNotifier = require('update-notifier');
const pkg = require('../package.json');
const boxen = require('boxen');
DownloadGitRepo = promisify(DownloadGitRepo);

const waitLoading = (message, fn) => async (...args) => {
  const spinner = ora(message);
  spinner.start();
  const data = await fn(...args);
  spinner.succeed(`${message} successfully`);
  return data;
};

const downloadTemplate = async (templateName) => {
  if (templateName === 'default') {
    const url = 'rikochyou/ts-quick-template/';
    const destPath = `${downloadDirPath}`;
    // console.log(destPath)
    await DownloadGitRepo(url, destPath);
    return destPath;
  } else {
    const url = 'rikochyou/ts-advanced-template/';
    const destPath = `${downloadDirPath}\\ts-advanced-template`;
    // console.log(destPath)
    await DownloadGitRepo(url, destPath);
    return destPath;
  }
};

const installDependencies = async (destPath) => {
  shell.cd(destPath);
  await exec('npm install');
};

const checkVersion = () => {
  const notifier = updateNotifier({
    pkg,
    updateCheckInterval: 0,
  });

  const { update } = notifier;
  if (update) {
    const message = [];
    message.push(
      `${chalk.bgYellowBright.black(' WARNI: ')} ${chalk.redBright(
        'ts-easy-cli is not latest.'
      )} \n`
    );
    message.push(
      chalk.yellowBright('current ') +
        chalk.yellowBright(update.current) +
        chalk.yellowBright(' -> ') +
        chalk.yellowBright('latest ') +
        chalk.redBright(update.latest)
    );
    message.push(
      `${chalk.blueBright('Up to date ')} ${chalk.redBright('npm i -g')} ${
        pkg.name
      }`
    );

    console.log(
      boxen(message.join('\n'), {
        padding: 2,
        margin: 2,
        align: 'center',
        borderColor: 'yellow',
        borderStyle: 'round',
      })
    );
  }
};

module.exports = async (projectName) => {
  checkVersion();
  const destPath = path.resolve(projectName);
  console.log(
    chalk.yellow('✨  Creating project in ') + chalk.cyan(`${destPath}`)
  );
  const templateNames = ['default', 'Manually select features'];
  const { currentTemplateName } = await inquirer.prompt({
    name: 'currentTemplateName',
    type: 'list',
    choices: templateNames,
    message: 'Please pick a template',
  });
  console.log(chalk.blue('✨  Initializing git repository...'));
  await waitLoading(
    'downloading template',
    downloadTemplate
  )(currentTemplateName);
  let sourcePath;
  if (currentTemplateName === 'default') {
    sourcePath = `${downloadDirPath}\\ts-quick-template`;
  } else {
    sourcePath = `${downloadDirPath}\\ts-advanced-template`;
  }

  const askPath = path.join(sourcePath, 'ask.js');

  // 处理default模板
  const srcTs = path.join(sourcePath, 'src/hello-world.ts');
  const testTs = path.join(sourcePath, 'test/hello-world.test.ts');

  const libPath = path.join(sourcePath, `src/${projectName}.ts`);
  const testPath = path.join(sourcePath, `test/${projectName}.test.ts`);
  shell.mv(srcTs, libPath);
  shell.mv(testTs, testPath);

  if (!fs.existsSync(askPath)) {
    await new Promise((resolve, reject) => {
      Metalsmith(__dirname)
        .source(sourcePath)
        .destination(destPath)
        .use((files, metal, done) => {
          const meta = metal.metadata();
          const res = { name: projectName };
          Object.assign(meta, res);

          Reflect.ownKeys(files).forEach(async (filePath) => {
            if (
              filePath.includes('package.json') ||
              filePath.includes('rollup')
            ) {
              const fileContent = files[filePath].contents.toString();

              if (fileContent.includes('<%')) {
                const resultContent = await render(fileContent, meta);

                files[filePath].contents = Buffer.from(resultContent);
              }
            }
          });
          done();
        })
        .build((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
    });
  } else {
    await new Promise((resolve, reject) => {
      Metalsmith(__dirname)
        .source(sourcePath)
        .destination(destPath)
        .use(async (files, metal, done) => {
          const config = require(askPath);

          const result = await inquirer.prompt(config);
          // console.log('result',result)
          const meta = metal.metadata();
          Object.assign(meta, result);
          done();
        })
        .use((files, metal, done) => {
          const result = metal.metadata();
          // console.log('result',result)
          Reflect.ownKeys(files).forEach(async (filePath) => {
            if (
              filePath.includes('package.json') ||
              filePath.includes('rollup')
            ) {
              const fileContent = files[filePath].contents.toString();
              // console.log(fileContent)

              if (fileContent.includes('<%')) {
                const resultContent = await render(fileContent, result);
                // console.log(resultContent)
                files[filePath].contents = Buffer.from(resultContent);
                console.log(files[filePath].contents.toString());
                // console.log(files[filePath].contents.toString())
              }
            }
          });
          done();
        })
        .build((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
    });
  }
  shell.cd(projectName);
  // console.log('\n pwd git', shell.pwd());
  const rmaskPath = path.join(destPath, 'ask.js');
  rm('-rf', rmaskPath);
  const gitPath = path.join(destPath, '.git');
  rm('-rf', gitPath);
  await exec('git init');

  console.log(chalk.blueBright('✨  Initializing dependencies...'));
  await waitLoading('install dependencies', installDependencies)(destPath);

  console.log(
    chalk.yellowBright(' Successfully created project ') +
      chalk.cyan(`${projectName}.`)
  );
  console.log(chalk.yellowBright(' Get started with the following commands:'));
  console.log(chalk.blue(`$ cd ${projectName}`));
  console.log(chalk.blue('$ npm start'));
  rm('-rf', sourcePath);
};
