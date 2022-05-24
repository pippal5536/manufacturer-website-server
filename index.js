const cors = require('cors')
require('dotenv').config();
const express = require('express')
const app = express()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 4000




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
        app.delete('/purchase/:id',  async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await collectionOfPurchasedTools.deleteOne(query);
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