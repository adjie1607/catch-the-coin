# Catch the Coin

Game web sederhana (HTML5 Canvas) untuk mata kuliah Pemrograman Game Berbasis Web.
Ambil koin emas, hindari kotak merah. Kumpulkan 100 poin sebelum waktu 30 detik habis.

Pembuat: _isi nama & NIM_

## Cara menjalankan

Buka `index.html` di browser (Chrome, Firefox, atau Edge). Tidak perlu install apa pun.
Font Fredoka dimuat dari Google Fonts, jadi butuh internet (tanpa internet tetap jalan dengan font bawaan).

## Kontrol

| Aksi | Input |
| --- | --- |
| Gerak | Tombol panah, atau sentuh & geser layar di HP |
| Mulai / main lagi | Klik tombol atau tekan `Enter` |
| Mute | Klik tombol suara atau tekan `M` |

## Aturan

- Koin: +10 poin
- Menabrak musuh: -5 poin
- Skor 100 = menang, waktu habis = kalah
- High score tersimpan di browser (`localStorage`)

## Struktur

```
index.html   halaman utama
style.css    tampilan halaman
game.js      logika game (update, draw, audio, input)
```

Semua gambar digambar lewat Canvas dan semua suara dibuat dengan Web Audio API,
jadi tidak ada folder `assets/`.

## Bug yang diperbaiki di versi final

- **Kecepatan bergantung FPS**: gerak dan timer dihitung per frame, jadi di monitor 144Hz pemain ~2.4x lebih cepat.
  Sekarang memakai `deltaTime` (piksel/detik).
- **Timer memakai `setInterval`**: tetap jalan saat tab disembunyikan. Sekarang dikurangi dari `deltaTime`, jadi game ikut berhenti.
- **Penalti setelah menang**: kalau menang dan menabrak musuh di frame yang sama, suara dan penalti musuh tetap jalan. Sekarang `update()` langsung berhenti saat menang.
- **Spawn menimpa objek**: musuh bisa muncul di atas pemain (kena penalti di detik pertama) atau di atas koin. Sekarang posisi acak menghindari objek lain.
- **Tombol "nyangkut"**: pindah window saat menahan panah membuat pemain jalan terus. Sekarang input di-reset saat window kehilangan fokus.
- **Gerak diagonal**: lebih cepat dari gerak lurus. Sekarang arahnya dinormalisasi.
- **Tahan `M`**: mute berkedip-kedip karena key repeat. Sekarang repeat diabaikan.
- **`localStorage` diblokir** (mis. mode private): game error. Sekarang di-`try/catch`.
