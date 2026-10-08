<div align="center">

  <a href="README.md">English</a> | <strong>Türkçe</strong>

  <img src="Image/icon.png" alt="Orenda Pass Logo" width="110" height="110" style="border-radius: 24px; box-shadow: 0 8px 24px rgba(37,99,235,0.3);" />

  # Orenda Pass
  ### Güvenli, Şifreli ve Sıfır Bilgili (Zero-Knowledge) Yerel Şifre Yöneticisi

  <p align="center">
    Verilerinizin kontrolünü tamamen elinize alın. Bulut bağımlılığı olmadan, <strong>AES-256</strong> şifreleme ile yerel ve bağımsız kullanıcı kasaları.
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Electron-44.6-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/Vite-7.3-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/Security-AES--256--GCM-success?style=for-the-badge&logo=shield" alt="AES-256" />
    <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
  </p>

  <p align="center">
    <a href="#-temel-özellikler">Özellikler</a> •
    <a href="#-ekran-görüntüleri">Ekran Görüntüleri</a> •
    <a href="#-güvenlik-mimarisi">Güvenlik</a> •
    <a href="#-kurulum-dosyası">İndir</a> •
    <a href="#-kurulum-ve-çalıştırma">Kaynaktan Derleme</a> •
    <a href="README.md">English Documentation</a>
  </p>

</div>

---

## 🌟 Genel Bakış

**Orenda Pass**, hassas hesap bilgilerinizi, kimlik doğrulama anahtarlarınızı (TOTP/2FA) ve gizli notlarınızı en yüksek güvenlik standartlarında saklamanız için geliştirilmiş açık kaynaklı bir masaüstü uygulamasıdır.

Geleneksel bulut tabanlı şifre yöneticilerinin aksine, **Orenda Pass** "Sıfır Bilgi" (*Zero-Knowledge*) prensibiyle çalışır. Ana şifreniz ve verileriniz hiçbir sunucuya iletilmez; şifreleme ve çözme işlemleri tamamen sizin bilgisayarınızda gerçekleşir.

---

## 📥 Kurulum Dosyası

**[⬇️ En güncel Windows kurulum dosyasını indirin](https://github.com/yigitfevzitugrul/Password-Manager/releases/latest)**

1. Son sürümün **Assets** bölümünden `Orenda.Pass-Setup-x.y.z.exe` dosyasını indirin.
2. Kurulum dosyasını çalıştırın. Dosya dijital olarak imzalı olmadığı için Windows SmartScreen uyarı gösterebilir: **Ek bilgi → Yine de çalıştır** seçeneğiyle devam edin.
3. **Orenda Pass**'i açın, bir hesap oluşturun ve ana şifrenizi belirleyin. **Ana şifre sıfırlanamaz** — unutursanız kasanız açılamaz.

Windows 10/11 (64-bit) gerektirir. İndirdiğiniz dosyayı doğrulayabilmeniz için her sürümün notlarında kurulum dosyasının SHA-256 özeti yer alır.

---

## 🛡️ Temel Özellikler

- 🔒 **Uçtan Uca Yerel Şifreleme (AES-256):** Tüm kasa verileriniz endüstri standardı AES-256 algoritmaları ve scrypt anahtar türetme ile şifrelenir.
- 👥 **Çoklu Kullanıcı Desteği:** Aynı bilgisayarı kullanan farklı bireyler için birbirinden tamamen izole edilmiş, bağımsız şifrelenmiş kullanıcı hesapları.
- 🔐 **İki Faktörlü Doğrulama (2FA / TOTP Entegrasyonu):**
  - **Uygulama İçi 2FA:** Kasaya girişte Google Authenticator, Microsoft Authenticator ve uyumlu TOTP uygulamaları desteği.
  - **Şifreler İçin TOTP:** Saklanan her hesap için 2FA kodu üretme ve geri sayım sayacı.
- 🔍 **Have I Been Pwned (HIBP) Sızıntı Analizi:** Şifrelerinizin bilinen küresel veri ihlallerinde yer alıp almadığını *k-Anonymity* güvenli sorgulama modeliyle denetleme.
- 📊 **Kasa Güvenlik Raporu:** Dinamik güvenlik skoru, zayıf ve tekrar eden şifre tespitleri, güvenlik önerileri.
- 🎲 **Gelişmiş Kriptografik Şifre Oluşturucu:** Renk kodlu karakter ayrımı (sayılar, semboller, harfler), gerçek zamanlı entropi hesabı ve tek tıkla ön ayarlar (*Dengeli, Güçlü, Maksimum, PIN*).
- 📦 **Esnek İçe / Dışa Aktarma (Yedekleme):** Chrome, Bitwarden, CSV ve JSON formatlarındaki yedekleri kolayca içeri aktarma veya dışa aktarma.
- ⏱️ **Kaba Kuvvet (Brute-Force) Koruması:** Arka arkaya yapılan hatalı giriş denemelerinde kademeli kilitlenme ve güvenlik zamanlayıcısı.
- 🌗 **Karanlık & Aydınlık Mod:** Göz yormayan Obsidian Black ve modern Clean Slate temaları.
- 🌍 **Çoklu Dil Desteği:** Tek tıkla Türkçe ve İngilizce dil değişimi.

---

## 📷 Ekran Görüntüleri

### 1. Giriş ve Hesap Seçim Ekranı
Çoklu kullanıcı mimarisi, zero-knowledge şifre koruması ve bağımsız hesap yönetimi.
<p align="center">
  <img src="Image/1.png" alt="Giriş Ekranı" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

### 2. Ana Kasa & Şifre Yönetimi Paneli
Kategorize edilmiş kayıtlar, anlık filtreleme, favoriler, şifre gücü göstergeleri ve hızlı kopyalama eylemleri.
<p align="center">
  <img src="Image/2.png" alt="Ana Kasa Paneli" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

### 3. Kasa Güvenlik Raporu & Sızıntı Denetimi
Kapsamlı kasa güvenlik skoru, veri sızıntısı tarayıcısı (HIBP) ve tekrar eden şifre uyarıları.
<p align="center">
  <img src="Image/3.png" alt="Kasa Güvenlik Raporu" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

### 4. Kriptografik Şifre Oluşturucu
Karakter türlerine göre renklendirilmiş önizleme, bit entropisi göstergesi ve hazır ön ayarlar.
<p align="center">
  <img src="Image/4.png" alt="Şifre Oluşturucu" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

### 5. Hesap Ayarları, 2FA & Veri Yönetimi
İki faktörlü kimlik doğrulama ayarları, modern JSON & CSV içe/dışa aktarma paneli ve tema tercihleri.
<p align="center">
  <img src="Image/5.png" alt="Hesap Ayarları ve Veri Yönetimi" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

## 🔒 Güvenlik Mimarisi

```
+-------------------------------------------------------------------+
|                        Kullanıcı Ana Şifresi                       |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|          scrypt Anahtar Türetme (bellek-yoğun, N = 2^17)           |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|                    AES-256-GCM Şifreleme                           |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|       Yerel Dosya Sistemi (vault_[userId].enc & users.json)        |
+-------------------------------------------------------------------+
```

- **Sıfır Bilgi Prensibi (Zero-Knowledge):** Ana şifreniz hiçbir zaman diske açık metin olarak kaydedilmez ve geliştiriciler dahil kimse tarafından sıfırlanamaz.
- **k-Anonymity Sızıntı Denetimi:** Have I Been Pwned API sorgularında şifrenin tamamı değil, SHA-1 özetinin yalnızca ilk 5 karakteri gönderilir; şifreniz asla açığa çıkmaz.
- **Oturum Koruması:** Kasa açıkken bellekte yalnızca türetilmiş anahtar tutulur. Kasa ayarlanabilir bir hareketsizlik süresinden sonra (varsayılan 5 dakika), ekran kilitlenince ve uyku modunda otomatik kilitlenir; kopyalanan şifreler ayarlanabilir bir süre sonra (varsayılan 30 saniye) panodan silinir.
- **Yerel Depolama İzolasyonu:** Her kullanıcının kasa dosyası işletim sisteminin güvenli uygulama verisi dizininde (`%APPDATA%/sifreyonetici`) ayrı dosyalarda tutulur.

---

## 🚀 Kurulum ve Çalıştırma

> Yalnızca uygulamayı kullanmak mı istiyorsunuz? [İndir](#-kurulum-dosyası) bölümüne bakın. Aşağıdaki adımlar kaynak koddan derlemek içindir.

### Gereksinimler
- [Node.js](https://nodejs.org/) (v18 veya üzeri önerilir)
- npm veya yarn

### Adımlar

1. **Depoyu klonlayın:**
   ```bash
   git clone https://github.com/yigitfevzitugrul/Password-Manager.git
   cd Password-Manager
   ```

2. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```

3. **Geliştirici modunda başlatın:**
   ```bash
   npm run dev
   ```
   *(Vite dev sunucusu ve Electron masaüstü penceresi eşzamanlı olarak açılacaktır.)*

4. **Üretim sürümünü derleyin (Windows Installer):**
   ```bash
   npm run build
   ```
   *(`dist-electron/` dizini altında Windows `.exe` kurulum dosyası üretilir.)*

5. **Testleri çalıştırın:**
   ```bash
   npm test
   npm run test:e2e
   ```
   *(`npm test` kasa formatını ve mantığını her platformun şifreleme uygulamasıyla sınar. `npm run test:e2e` gerçek uygulamayı geçici bir veri klasörüyle başlatıp uçtan uca dener; çalışırken sistem panosunu kullanır.)*

### Kod Yapısı

- `shared/` — kasa formatı, şifreleme ve tüm kasa mantığı. Platformdan bağımsızdır; masaüstü uygulaması ile hazırlanmakta olan mobil uygulamalar tam olarak aynı dosyaları okuyup yazar.
- `electron/` — masaüstü kabuğu: pencere, güvenlik ayarları ve ortak kodun üzerinde çalıştığı Node tabanlı şifreleme, depolama ve pencereler.
- `src/` — React kullanıcı arayüzü.
- `tests/` — birim testleri (`tests/unit`) ve uçtan uca testler (`tests/e2e`).

---

## 🛠️ Kullanılan Teknolojiler

| Alan | Teknoloji | Açıklama |
| :--- | :--- | :--- |
| **Masaüstü Altyapısı** | [Electron 44](https://www.electronjs.org/) | Çapraz platform masaüstü çekirdeği |
| **Ön Yüz Kütüphanesi** | [React 19](https://react.dev/) | Hızlı ve reaktif bileşen mimarisi |
| **Derleme & Paketleme** | [Vite 7](https://vitejs.dev/) | Ultra hızlı HMR ve üretim derleyicisi |
| **Dağıtım / Paketleyici** | [electron-builder](https://www.electron.build/) | Windows NSIS kurulum paketi oluşturucu |
| **Güvenlik & Kripto** | Node.js `crypto` | AES-256, scrypt, SHA-256 / SHA-1 |
| **Tipografi & Stil** | Space Grotesk & Inter | Modern ve rafine kullanıcı deneyimi |

---

## 📄 Lisans

Bu proje kişisel ve açık kaynaklı kullanım amacıyla geliştirilmiştir. Ayrıntılar için `LICENSE` dosyasına bakabilirsiniz.
