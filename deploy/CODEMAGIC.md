# Codemagic mobil derlemeleri

GitHub deposu: `hamzabilginn/GRID-SHIFT`, dal: `main`. Codemagic'te **Add application** üzerinden depoyu bağlayın ve **codemagic.yaml** yapılandırmasını seçin. **Start new build** ile aşağıdaki akışlardan birini başlatın. Bu dosya hesap bağlantısı veya tamamlanmış derleme anlamına gelmez.

## Android test APK

`android-debug` imza yüklemeden çalışır. Test APK'sı derlemenin Artifacts bölümünde bulunur. Play Store'a yüklenmez; cihaz testi içindir.

## Android mağaza paketi

Team settings → Code signing identities → Android keystores bölümüne upload keystore'u yükleyin; reference name **grid_shift_upload** olmalı. Ardından `android-release` seçin. AAB, Artifacts bölümünde oluşur. BUILD_NUMBER, Android versionCode olarak kullanılır; daha önce yayımlanmış sürüm varsa Codemagic sayacını ondan büyük ayarlayın.

## iOS mağaza paketi

Team settings → Code signing identities bölümüne Apple Distribution sertifikası ve `com.hamzabilginn.gridshift` için App Store provisioning profile yükleyin. `ios-release` akışı native projeyi üretir, profilleri uygular ve IPA hazırlar. Apple Developer hesabındaki uygulama kimliği eşleşmelidir. İlk derlemede Apple paket bağımlılıkları çözümlenir. TestFlight'a otomatik yayın tanımlı değildir.

## Kontrol

Üç akış da kilit dosyasından `npm ci`, ortak oyun testleri ve Capacitor üretimi çalıştırır. Android SDK/Gradle ve macOS/Xcode derlemesi CI üzerinde yapılır. Başarılı çıktı alınmadan paket derlenmiş sayılmaz. Native projeler üretilir; `android/` ve `ios/` kaynak kontrolüne dahil edilmez.

Native uygulamanın çevrimiçi adresi `public/app.js` içindedir. HTTPS servisinin erişilebilirliği ayrıca doğrulanmalıdır; çevrimdışı antrenman yerel paket dosyalarını kullanır.

Kaynak: https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/
