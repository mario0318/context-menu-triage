import fs from 'node:fs';
import * as PELibrary from 'pe-library';
import * as ResEdit from 'resedit';

const [executablePath, version] = process.argv.slice(2);
if (!executablePath || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version || '')) {
  throw new Error('usage: node scripts/set-exe-metadata.mjs <exe> <major.minor.patch[.revision]>');
}

const numericVersion = version.split('.').map(Number);
while (numericVersion.length < 4) numericVersion.push(0);

const input = fs.readFileSync(executablePath);
// SEA injection invalidates Node's upstream signature; the final release is signed after metadata is set.
const executable = PELibrary.NtExecutable.from(input, { ignoreCert: true });
const resources = PELibrary.NtExecutableResource.from(executable);
const versionEntries = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
if (versionEntries.length === 0) throw new Error('executable has no version resource');

for (const versionInfo of versionEntries) {
  versionInfo.setFileVersion(...numericVersion, 1033);
  versionInfo.setProductVersion(...numericVersion, 1033);
  versionInfo.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      CompanyName: 'mario0318',
      FileDescription: 'Inspect and reversibly block Windows Explorer context menu handlers',
      InternalName: 'context-menu-triage',
      LegalCopyright: 'Copyright (c) mario0318',
      OriginalFilename: 'context-menu-triage.exe',
      ProductName: 'Context Menu Triage',
    },
    true,
  );
  versionInfo.outputToResourceEntries(resources.entries);
}

resources.outputResource(executable);
fs.writeFileSync(executablePath, Buffer.from(executable.generate()));
