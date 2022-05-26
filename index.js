const express = require('express')
const app = express()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 4000
require('dotenv').config();


const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const cors = require('cors')
app.use(cors());
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7lxs2.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// JWT VERIFICATION
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}
async function run() {

    try {
        await client.connect();
        console.log('Mongo db is connected')
        const collectionOfTools = client.db('tools_manufacturer').collection('tools')
        const collectionOfUsers = client.db('tools_manufacturer').collection('users');
        const collectionOfPurchasedTools = client.db('tools_manufacturer').collection('purchased-tools');
        const collectionOfReviews = client.db('tools_manufacturer').collection('reviews');
        const collectionOfPayment = client.db('tools_manufacturer').collection('payment');
        const collectionOfUserProfile = client.db('tools_manufacturer').collection('user-profiles');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await collectionOfUsers.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        // to load tools in homepage
        app.get('/tool', async (req, res) => {
            const query = {};
            const cursor = collectionOfTools.find(query);
            const tools = await cursor.toArray();
            res.send(tools);

        })
        // to load selected tool in purchase page
        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const tool = await collectionOfTools.findOne(query);
            res.send(tool);
        });
        // to upload purchased tool
        app.post('/purchase', async (req, res) => {
            const purchasedTools = req.body;
            const result = await collectionOfPurchasedTools.insertOne(purchasedTools);
            return res.send(result);
        })
        // to save registered users to database
        app.put('/user/:email', async (req, res) => {

            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await collectionOfUsers.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET)
            res.send({ result, token });
        })

        // to load orders in my orders page
        app.get('/purchase', verifyJWT, async (req, res) => {
            const user = req.query.user;
            const decodedEmail = req.decoded.email;
            if (user === decodedEmail) {
                const query = { user: user };
                const purchasedTools = await collectionOfPurchasedTools.find(query).toArray();
                return res.send(purchasedTools);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }
        })

        // to delete orders
        app.delete('/purchase/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await collectionOfPurchasedTools.deleteOne(query);
            res.send(result);
        })
        // to post review
        app.post('/review', async (req, res) => {
            const review = req.body;
            const result = await collectionOfReviews.insertOne(review);
            res.send(result);
        });
        // load reviews in homepage
        app.get('/review', async (req, res) => {
            const query = {};
            const cursor = collectionOfReviews.find(query);
            const reviews = await cursor.toArray();
            res.send(reviews);

        })
        // for payment page
        app.get('/purchase/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const purchase = await collectionOfPurchasedTools.findOne(query);
            res.send(purchase);
        })
        // create-payment-intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const order = req.body;
            const price = order.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });
        // store payment in databse
        app.patch('/purchase/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const result = await collectionOfPayment.insertOne(payment);
            const updatedBooking = await collectionOfPurchasedTools.updateOne(filter, updatedDoc);
            res.send(updatedBooking);
        })

        // for my profile page to upload user information
        app.put('/userProfile', async (req, res) => {

            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await collectionOfUserProfile.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET)
            res.send({ result, token });
        })

        // for use Admin hook
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await collectionOfUsers.findOne({ email: email });
            const determineAdmin = user.role === 'admin';
            res.send({ admin: determineAdmin })
        })
        // to load all users
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await collectionOfUsers.find().toArray();
            res.send(users);
        });
        // to make another user Admin
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: "admin" },
            };
            const result = await collectionOfUsers.updateOne(filter, updateDoc);
            res.send(result);
        })
        // to add tool in homepage by admin
        app.post('/tool', async (req, res) => {
            const tool = req.body;
            const result = await collectionOfTools.insertOne(tool);
            res.send(result);
        });
        // to load all orders in manage all orders page
        app.get('/allorders',verifyJWT,verifyAdmin, async (req, res) => {
            const query = {};
            const cursor = collectionOfPurchasedTools.find(query);
            const orders = await cursor.toArray();
            res.send(orders);

        })
        // change status to shipped
        app.patch('/allorders/:id', verifyJWT,verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    approved: true,
                }
            }
            const updatedBooking = await collectionOfPurchasedTools.updateOne(filter, updatedDoc);
            res.send(updatedBooking);
        })
        // delete tool
        app.delete('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await collectionOfTools.deleteOne(query);
            res.send(result);
        })
    }

    finally {

    }

}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})