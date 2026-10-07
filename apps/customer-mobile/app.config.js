module.exports = ({ config }) => {
  const appName = process.env.APP_NAME || process.env.EXPO_PUBLIC_APP_NAME;
  const bundleSuffix = process.env.BUNDLE_ID_SUFFIX;
  const scheme = process.env.DEEP_LINK_SCHEME;
  const iconUrl = process.env.APP_ICON_URL || process.env.APP_ICON_PATH;
  const splashUrl = process.env.APP_SPLASH_URL || process.env.APP_SPLASH_PATH;
  const splashBg = process.env.SPLASH_BG_COLOR;
  const primaryColor = process.env.PRIMARY_COLOR;

  const baseIosBundle = config.ios?.bundleIdentifier || 'com.dilivygo.customer';
  const baseAndroidPkg = config.android?.package || 'com.dilivygo.customer';

  const iosBundle = bundleSuffix ? `${baseIosBundle}.${bundleSuffix.toLowerCase()}` : baseIosBundle;
  const androidPkg = bundleSuffix ? `${baseAndroidPkg}.${bundleSuffix.toLowerCase()}` : baseAndroidPkg;

  return {
    ...config,
    name: appName || config.name,
    scheme: scheme || config.scheme,
    ...(iconUrl ? { icon: iconUrl } : {}),
    splash: {
      ...config.splash,
      ...(splashUrl ? { image: splashUrl } : {}),
      ...(splashBg ? { backgroundColor: splashBg } : {}),
    },
    ios: {
      ...config.ios,
      bundleIdentifier: iosBundle,
      splash: {
        ...(config.ios?.splash || {}),
        ...(splashUrl ? { image: splashUrl } : {}),
        ...(splashBg ? { backgroundColor: splashBg } : {}),
      },
    },
    android: {
      ...config.android,
      package: androidPkg,
      adaptiveIcon: {
        ...(config.android?.adaptiveIcon || {}),
        ...(iconUrl ? { foregroundImage: iconUrl } : {}),
      },
      splash: {
        ...(config.android?.splash || {}),
        ...(splashUrl ? { image: splashUrl } : {}),
        ...(splashBg ? { backgroundColor: splashBg } : {}),
      },
    },
    extra: {
      ...config.extra,
      ...(primaryColor ? { primaryColor } : {}),
    },
  };
};
