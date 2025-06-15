# Backend - Aplikasi Alfa Optik POS

Repositori ini berisi kode sumber untuk sisi server (backend) dari aplikasi **Alfa Optik POS**.

Backend ini bertanggung jawab untuk menangani semua logika bisnis, komunikasi dengan database, dan menyediakan API untuk aplikasi frontend.

Teknologi yang digunakan:
-   **Runtime**: Node.js
-   **Framework**: Express.js
-   **Database**: MySQL
-   **Dependensi Kunci**:
    -   `mysql2`: Untuk koneksi ke database MySQL.
    -   `express`: Untuk membangun server dan rute API.
    -   `cors`: Untuk menangani kebijakan Cross-Origin Resource Sharing.
    -   `bcryptjs`: Untuk hashing dan verifikasi password yang aman.

---

## Repositori Aplikasi Utama (Frontend)

Untuk melihat kode aplikasi utama (frontend) yang dibuat dengan **Flutter**, silakan kunjungi repositori utama di bawah ini:

### ➡️ **[emredoooo/alfaoptik-flutter-app](https://github.com/emredoooo/alfaoptik-flutter-app)**

## Panduan Instalasi dan Setup

Ikuti langkah-langkah ini untuk menjalankan server backend secara lokal.

### 1. Prasyarat
-   Node.js (disarankan versi LTS)
-   Server Database MySQL (misalnya dari XAMPP, Laragon, dll.)

### 2. Setup Database
-   Buat sebuah database baru di server MySQL Anda dengan nama `ao_db`.
-   Impor file skema `ini_database(11062025).txt` ke dalam database `ao_db` untuk membuat semua tabel yang diperlukan.

### 3. Install Dependensi Proyek
-   Buka terminal di dalam folder `alfaoptik-backend` ini.
-   Jalankan perintah berikut untuk mengunduh semua pustaka yang dibutuhkan:
    ```bash
    npm install
    ```

### 4. PENTING: Membuat Pengguna Admin Pertama
Database awal Anda mungkin berisi password dalam bentuk teks biasa. Server ini menggunakan `bcrypt` dan tidak akan bisa memvalidasi password tersebut. Anda harus membuat setidaknya satu pengguna dengan password yang sudah di-hash.

---
