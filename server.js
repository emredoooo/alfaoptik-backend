// server.js (Versi Final, Lengkap, dan Stabil)

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const port = 3000;

// ---- Konfigurasi Koneksi Database ----
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'ao_db',
    connectionLimit: 10,
    dateStrings: true 
};
const pool = mysql.createPool(dbConfig).promise();

// ---- Middleware Global ----
app.use(cors());
app.use(express.json());

// =================================================================
// ====                    RUTE AUTENTIKASI                     ====
// =================================================================

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
 
    if (!username || !password) {
        return res.status(400).json({ message: 'Username dan password diperlukan.' });
    }

    try {
        const query = `
            SELECT u.user_id, u.username, u.password_hash, u.role, b.branch_code, b.branch_name
            FROM users u LEFT JOIN branches b ON u.branch_id = b.branch_id
            WHERE u.username = ?;
        `;
        const [users] = await pool.query(query, [username]);

        if (users.length === 0) {
            return res.status(401).json({ message: 'Username atau password salah.' });
        }

        const user = users[0];
        const isPasswordMatch = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordMatch) {
            return res.status(401).json({ message: 'Username atau password salah.' });
        }
        
        res.json({ message: 'Login berhasil!', user: user });

    } catch (error) {
        console.error('Error saat login:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
    }
});

// =================================================================
// ====                      RUTE PENGGUNA                      ====
// =================================================================

app.post('/api/users', async (req, res) => {
    const { username, password, full_name, role, branch_id } = req.body;
    if (!username || !password || !full_name || !role) {
        return res.status(400).json({ message: 'Data pengguna tidak lengkap.' });
    }
    if (role === 'Admin Cabang' && !branch_id) {
        return res.status(400).json({ message: 'Admin Cabang harus memiliki ID Cabang.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES (?, ?, ?, ?, ?);`;
        await pool.query(query, [username, hashedPassword, full_name, role, role === 'Admin Cabang' ? branch_id : null]);
        res.status(201).json({ message: 'Pengguna baru berhasil dibuat!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Username sudah digunakan.' });
        }
        console.error('Error saat membuat pengguna:', error);
        res.status(500).json({ message: 'Gagal membuat pengguna baru.' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const query = `
            SELECT u.user_id, u.username, u.full_name, u.role, b.branch_name
            FROM users u LEFT JOIN branches b ON u.branch_id = b.branch_id ORDER BY u.full_name;
        `;
        const [users] = await pool.query(query);
        res.json(users);
    } catch (error) {
        console.error('Error mengambil daftar pengguna:', error);
        res.status(500).json({ message: 'Gagal mengambil data pengguna.' });
    }
});

app.put('/api/users/:userId', async (req, res) => {
    const { userId } = req.params;
    const { full_name, role, branch_id } = req.body;
    if (!full_name || !role) {
        return res.status(400).json({ message: 'Nama lengkap dan peran diperlukan.' });
    }
    if (role === 'Admin Cabang' && !branch_id) {
        return res.status(400).json({ message: 'Admin Cabang harus memiliki ID Cabang.' });
    }
    try {
        const query = `UPDATE users SET full_name = ?, role = ?, branch_id = ? WHERE user_id = ?;`;
        await pool.query(query, [full_name, role, role === 'Admin Cabang' ? branch_id : null, userId]);
        res.json({ message: 'Data pengguna berhasil diperbarui.' });
    } catch (error) {
        console.error('Error saat memperbarui pengguna:', error);
        res.status(500).json({ message: 'Gagal memperbarui data pengguna.' });
    }
});

// =================================================================
// ====                      RUTE CABANG                        ====
// =================================================================

app.get('/api/branches', async (req, res) => {
    try {
        const [branches] = await pool.query('SELECT branch_id, branch_code, branch_name FROM branches ORDER BY branch_name;');
        res.json(branches);
    } catch (error) {
        console.error('Error mengambil daftar cabang:', error);
        res.status(500).json({ message: 'Gagal mengambil data cabang.' });
    }
});

// =================================================================
// ====                      RUTE PRODUK                        ====
// =================================================================

app.get('/api/products', async (req, res) => {
    const { branch_code } = req.query;
    if (!branch_code) {
        return res.status(400).json({ message: 'Parameter branch_code diperlukan.' });
    }
    try {
        const query = `
            SELECT 
                p.product_id, p.product_code, p.product_name, p.brand_name,
                pc.category_name AS category, p.description, p.purchase_price, p.selling_price, 
                p.unit, p.track_serial_batch, p.image_url,
                COALESCE(bi.quantity, 0) AS stock
            FROM products p
            LEFT JOIN product_categories pc ON p.category_id = pc.category_id
            LEFT JOIN branch_inventory bi ON p.product_id = bi.product_id AND bi.branch_id = (
                SELECT branch_id FROM branches WHERE branch_code = ? LIMIT 1
            );
        `;
        const [results] = await pool.query(query, [branch_code]);
        const productsForFlutter = results.map(p => ({
            id: p.product_id,
            product_code: p.product_code,
            name: p.product_name,
            category: p.category || 'Lainnya',
            brand: p.brand_name,
            description: p.description,
            price: parseFloat(p.selling_price),
            purchase_price: p.purchase_price ? parseFloat(p.purchase_price) : null,
            track_serial_batch: Boolean(p.track_serial_batch),
            image_url: p.image_url,
            stock: parseInt(p.stock, 10)
        }));
        res.json(productsForFlutter);
    } catch (error) {
        console.error('Error mengambil produk:', error);
        res.status(500).json({ message: 'Gagal mengambil data produk.' });
    }
});

app.post('/api/products', async (req, res) => {
    const { name, product_code, category, price, stock, track_serial_batch, brand, purchase_price, description, branch_code } = req.body;
    if (!name || !product_code || !price) {
        return res.status(400).json({ message: 'Nama, kode produk, dan harga tidak boleh kosong.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [cat] = await connection.query('SELECT category_id FROM product_categories WHERE category_name = ?', [category]);
        const categoryId = cat.length > 0 ? cat[0].category_id : null;
        const [branch] = await connection.query('SELECT branch_id FROM branches WHERE branch_code = ?', [branch_code]);
        if (branch.length === 0) throw new Error(`Cabang dengan kode ${branch_code} tidak ditemukan.`);
        const branchId = branch[0].branch_id;
        const productQuery = `INSERT INTO products (product_name, product_code, brand_name, category_id, description, purchase_price, selling_price, track_serial_batch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const [productResult] = await connection.query(productQuery, [name, product_code, brand || null, categoryId, description || null, purchase_price || null, price, track_serial_batch || false]);
        const newProductId = productResult.insertId;
        if (stock && stock > 0) {
            const inventoryQuery = `INSERT INTO branch_inventory (product_id, branch_id, quantity, last_restock_date) VALUES (?, ?, ?, NOW())`;
            await connection.query(inventoryQuery, [newProductId, branchId, stock]);
        }
        await connection.commit();
        res.status(201).json({ message: 'Produk berhasil ditambahkan!', productId: newProductId });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error saat menambah produk:', error);
        res.status(500).json({ message: 'Gagal menyimpan produk ke database.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.patch('/api/products/:productId/stock', async (req, res) => {
    const { productId } = req.params;
    const { quantity, branch_id } = req.body;
    if (!quantity || !branch_id || quantity <= 0) {
        return res.status(400).json({ message: 'Kuantitas dan ID Cabang diperlukan dan harus valid.' });
    }
    try {
        const query = `
            INSERT INTO branch_inventory (product_id, branch_id, quantity, last_restock_date)
            VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE
            quantity = quantity + VALUES(quantity), last_restock_date = NOW();
        `;
        await pool.query(query, [productId, branch_id, quantity]);
        res.status(200).json({ message: `Stok untuk produk ID ${productId} berhasil ditambahkan.` });
    } catch (error) {
        console.error('Error saat menambah stok:', error);
        res.status(500).json({ message: 'Gagal menambah stok.', error: error.message });
    }
});

// =================================================================
// ====                     RUTE PELANGGAN                      ====
// =================================================================

app.get('/api/customers/phone/:phoneNumber', async (req, res) => {
  const { phoneNumber } = req.params;

  if (!phoneNumber) {
    return res.status(400).json({ message: 'Nomor telepon diperlukan.' });
  }

  try {
    const query = 'SELECT * FROM customers WHERE phone_number = ?';
    const [results] = await pool.query(query, [phoneNumber]);

    if (results.length > 0) {
      // Pelanggan ditemukan, kirim datanya
      const customer = results[0];
      const customerForFlutter = {
        id: customer.customer_id.toString(),
        name: customer.name,
        phoneNumber: customer.phone_number,
        address: customer.address,
        // Format tanggal agar konsisten dan bisa di-parse oleh Dart
        dateOfBirth: customer.date_of_birth ? new Date(customer.date_of_birth).toISOString() : null
      };
      res.json(customerForFlutter);
    } else {
      // Pelanggan tidak ditemukan
      res.status(404).json({ message: 'Pelanggan tidak ditemukan.' });
    }

  } catch (error) {
    console.error('Database query error saat mencari pelanggan:', error);
    res.status(500).json({ message: 'Gagal mencari data pelanggan.', error: error.message });
  }
});

// =================================================================
// ====                     RUTE TRANSAKSI                      ====
// =================================================================

app.post('/api/transactions', async (req, res) => {
    const { branch_code, user_id, items, total_amount, payment_method, amount_received, change_amount, reference_number, notes, customer_data } = req.body;
    if (!items || items.length === 0 || !total_amount || !payment_method) {
        return res.status(400).json({ message: 'Data transaksi tidak lengkap.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [branch] = await connection.query('SELECT branch_id FROM branches WHERE branch_code = ?', [branch_code]);
        if (branch.length === 0) throw new Error(`Cabang ${branch_code} tidak valid.`);
        const branchId = branch[0].branch_id;

        for (const item of items) {
            const [stockData] = await connection.query('SELECT quantity FROM branch_inventory WHERE product_id = ? AND branch_id = ? FOR UPDATE', [item.product_id, branchId]);
            const currentStock = stockData.length > 0 ? stockData[0].quantity : 0;
            if (currentStock < item.quantity) {
                throw new Error(`Stok untuk produk "${item.product_name}" tidak mencukupi. Sisa ${currentStock}.`);
            }
        }

        let customerId = null;
        if (customer_data && customer_data.phone_number) {
            const [existingCustomer] = await connection.query('SELECT customer_id FROM customers WHERE phone_number = ?', [customer_data.phone_number]);
            if (existingCustomer.length > 0) {
                customerId = existingCustomer[0].customer_id;
            } else if (customer_data.name) {
                // --- PERBAIKAN UTAMA DI SINI ---
                const insertQuery = 'INSERT INTO customers (name, phone_number, address, date_of_birth) VALUES (?, ?, ?, ?)';
                const dob = customer_data.date_of_birth && customer_data.date_of_birth.trim() !== '' 
                    ? new Date(customer_data.date_of_birth).toISOString().slice(0, 10) 
                    : null;
                const [newCustomer] = await connection.query(insertQuery, [
                    customer_data.name,
                    customer_data.phone_number,
                    customer_data.address || null,
                    dob
                ]);
                customerId = newCustomer.insertId;
            }
        }

        const now = new Date();
        const [countResult] = await connection.query("SELECT COUNT(*) as count FROM transactions WHERE branch_code = ? AND DATE(transaction_date) = CURDATE()", [branch_code]);
        const dailySequence = String(countResult[0].count + 1).padStart(3, '0');
        const dateForInvoice = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const invoiceNumber = `INV-${branch_code}-${dateForInvoice}-${dailySequence}`;

        const transactionQuery = `INSERT INTO transactions (invoice_number, branch_code, user_id, total_amount, payment_method, amount_received, change_amount, reference_number, notes, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const [transResult] = await connection.query(transactionQuery, [invoiceNumber, branch_code, user_id, total_amount, payment_method, amount_received, change_amount, reference_number || null, notes || null, customerId]);
        const transactionId = transResult.insertId;

        const itemsValues = items.map(item => [transactionId, item.product_id, item.product_name, item.quantity, item.price_per_item, item.subtotal]);
        await connection.query('INSERT INTO transaction_items (transaction_id, product_id, product_name, quantity, price_per_item, subtotal) VALUES ?', [itemsValues]);

        for (const item of items) {
            await connection.query('UPDATE branch_inventory SET quantity = quantity - ? WHERE product_id = ? AND branch_id = ?', [item.quantity, item.product_id, branchId]);
        }
        
        await connection.commit();
        res.status(201).json({ message: 'Transaksi berhasil!', transactionId, invoiceNumber });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error saat menyimpan transaksi:', error);
        res.status(500).json({ message: 'Gagal menyimpan transaksi.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// =================================================================
// ====                      RUTE LAPORAN                       ====
// =================================================================

app.get('/api/reports/sales', async (req, res) => {
    const { startDate, endDate, branchCode } = req.query;
    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Parameter startDate dan endDate diperlukan.' });
    }
    try {
        const params = [startDate, endDate];
        let branchFilter = '';
        if (branchCode) {
            branchFilter = `AND t.branch_code = ?`;
            params.push(branchCode);
        }
        const summaryQuery = `
            SELECT SUM(t.total_amount) AS total_revenue, COUNT(t.transaction_id) AS total_transactions, AVG(t.total_amount) AS average_transaction_value
            FROM transactions t WHERE DATE(t.transaction_date) BETWEEN ? AND ? ${branchFilter}
        `;
        const [summaryResult] = await pool.query(summaryQuery, params);
        const topProductsQuery = `
            SELECT p.product_name, SUM(ti.quantity) AS total_quantity_sold
            FROM transaction_items ti
            JOIN transactions t ON ti.transaction_id = t.transaction_id
            JOIN products p ON ti.product_id = p.product_id
            WHERE DATE(t.transaction_date) BETWEEN ? AND ? ${branchFilter}
            GROUP BY p.product_name ORDER BY total_quantity_sold DESC LIMIT 5;
        `;
        const [top_selling_products] = await pool.query(topProductsQuery, params);
        res.json({
            summary: {
                total_revenue: parseFloat(summaryResult[0].total_revenue) || 0,
                total_transactions: parseInt(summaryResult[0].total_transactions, 10) || 0,
                average_transaction_value: parseFloat(summaryResult[0].average_transaction_value) || 0
            },
            top_selling_products: top_selling_products || []
        });
    } catch (error) {
        console.error('Error membuat laporan:', error);
        res.status(500).json({ message: 'Gagal membuat laporan penjualan.' });
    }
});

// ---- Jalankan Server ----
app.listen(port, () => {
    console.log(`Server API Alfa Optik berjalan di http://localhost:${port}`);
});