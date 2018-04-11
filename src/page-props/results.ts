import { parsePackageString } from '../util/npm-parser';
import { findAll, findOne, insert } from '../util/backend/db';
import {
    fetchManifest,
    getLatestVersion,
    getMostRecentVersions,
    getAllVersions,
} from '../util/npm-api';
import { calculatePackageSize } from '../util/backend/npm-stats';
import { versionUnknown } from '../util/constants';

export async function getResultProps(query: ParsedUrlQuery, tmp: string) {
    if (query && typeof query.p === 'string') {
        let { name, version } = parsePackageString(query.p);
        let manifest: NpmManifest;
        try {
            manifest = await fetchManifest(name);
        } catch (e) {
            console.error(`Package ${name} does not exist in npm`);
            return packageNotFound(name);
        }

        if (!version) {
            version = await getLatestVersion(manifest);
            console.log(`Querystring missing version, using version ${version}`);
        }

        const allVersions = getAllVersions(manifest);
        if (!allVersions.includes(version)) {
            console.error(`Version ${version} does not exist in npm`);
            return packageNotFound(name);
        }
        const mostRecentVersions = getMostRecentVersions(allVersions, 15);

        let existing = await findOne(name, version);
        if (!existing) {
            console.log(`Cache miss for ${name}@${version}...`);
            const start = new Date();
            existing = await calculatePackageSize(name, version, tmp);
            const end = new Date();
            const sec = (end.getTime() - start.getTime()) / 1000;
            console.log(`Calculated size of ${name}@${version} in ${sec}s`);
            insert(existing);
        }

        const cachedVersions = await findAll(name);

        const readings = mostRecentVersions.map(v => {
            if (v in cachedVersions) {
                return cachedVersions[v];
            } else {
                return {
                    name: name,
                    version: v,
                    publishSize: 0,
                    installSize: 0,
                    disabled: true,
                };
            }
        });
        const result: ResultProps = { pkgSize: existing, readings };
        return result;
    }

    throw new Error(`Unknown query string ${query}`);
}

function packageNotFound(name: string) {
    const pkgSize: PkgSize = {
        name,
        version: versionUnknown,
        publishSize: 0,
        installSize: 0,
        disabled: true,
    };
    const result: ResultProps = { pkgSize, readings: [] };
    return result;
}