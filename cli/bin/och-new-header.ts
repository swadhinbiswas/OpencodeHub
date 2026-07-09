import chalk from "chalk";
import boxen from "boxen";
import figlet from "figlet";
import gradient from "gradient-string";

const ascii = figlet.textSync("OpenCodeHub", { font: "Standard" });
const gradientText = gradient.pastel.multiline(ascii);

const box = boxen(gradientText + "\n" + chalk.gray("Stack-first PR workflows from your terminal"), {
  padding: 1,
  margin: 1,
  borderStyle: "round",
  borderColor: "cyan",
  title: "OCH CLI",
  titleAlignment: "center"
});

console.log(box);
