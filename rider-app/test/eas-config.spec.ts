import * as fs from 'fs';
import * as path from 'path';

describe('Rider App EAS & Routing Configuration Integrity', () => {
  const appJsonPath = path.join(__dirname, '..', 'app.json');
  const easJsonPath = path.join(__dirname, '..', 'eas.json');

  it('validates app.json contains the exact approved EAS projectId', () => {
    const raw = fs.readFileSync(appJsonPath, 'utf8');
    const appJson = JSON.parse(raw) as {
      expo: {
        scheme: string;
        extra: {
          eas: {
            projectId: string;
          };
        };
      };
    };

    expect(appJson.expo.extra.eas.projectId).toBe('e934b098-16f8-4e65-8581-7c9cf77d5816');
  });

  it('validates app.json registers the ghanadash-rider:// deep linking scheme', () => {
    const raw = fs.readFileSync(appJsonPath, 'utf8');
    const appJson = JSON.parse(raw) as {
      expo: {
        scheme: string;
      };
    };

    expect(appJson.expo.scheme).toBe('ghanadash-rider');
  });

  it('validates eas.json defines an internal APK preview build profile for rider Android distribution', () => {
    const raw = fs.readFileSync(easJsonPath, 'utf8');
    const easJson = JSON.parse(raw) as {
      build: {
        preview: {
          distribution: string;
          android: {
            buildType: string;
          };
        };
      };
    };

    expect(easJson.build.preview.distribution).toBe('internal');
    expect(easJson.build.preview.android.buildType).toBe('apk');
  });
});
