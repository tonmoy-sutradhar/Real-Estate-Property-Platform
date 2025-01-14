require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 7000;

// MiddleWare
app.use(express.json());
app.use(cors());

// ----------------------------------------MongoDB Connection -----------------------------------------------------

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}@cluster0.cjt8m.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

// ----------------------------------------MongoDB Connection -----------------------------------------------------

// Port run ------->>
app.get("/", (req, res) => {
  res.send("Real estate property sell Platform server is running ");
});
app.listen(port, () => {
  console.log("Port is running on port", port);
});

// username: real-estate-property-platform
// p: I7Wr69mDUHJDoDQj
