if (process.env.VERCEL) process.exit(0);

const fs = require("fs");
const path = require("path");

function fixProguard(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory() && file.name !== ".git") {
      fixProguard(fullPath);
    } else if (file.name === "build.gradle") {
      const content = fs.readFileSync(fullPath, "utf8");
      if (content.includes("proguard-android.txt'")) {
        const fixed = content.replace(
          /getDefaultProguardFile\('proguard-android\.txt'\)/g,
          "getDefaultProguardFile('proguard-android-optimize.txt')",
        );
        fs.writeFileSync(fullPath, fixed, "utf8");
        console.log("Fixed:", fullPath);
      }
    }
  }
}

fixProguard(path.join(__dirname, "..", "node_modules"));
console.log("All proguard files fixed.");
