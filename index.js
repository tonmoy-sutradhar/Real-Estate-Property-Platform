require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const nodemailer = require("nodemailer");
const port = process.env.PORT || 7000;

// --------------------------------------------------------Middleware--------------------------------------------------
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://real-estate-property-platform.web.app",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// --------------------------------------------------------VerifyToken--------------------------------------------------
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

// --------------------------------------------------------Email Send(NodeMailer)--------------------------------------------------
// send email using nodemailer
const sendEmail = (emailAddress, emailData) => {
  // create transporter
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS,
    },
  });
  // Verify connection
  transporter.verify((error, success) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Transporter is ready to emails.", success);
    }
  });
  // transporter.sendMail()
  const mailBody = {
    from: process.env.NODEMAILER_USER,
    to: emailAddress,
    subject: emailData?.subject,
    html: `<p>${emailData?.message}</p>`,
  };

  // ---------------------------------------------------send email-----------------------------------------------------
  transporter.sendMail(mailBody, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Email Sent: " + info?.response);
    }
  });
};

// ----------------------------------------MongoDB Connection -----------------------------------------------------

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
    // await client.connect();

    const db = client.db("Real-estate-property-platform");
    const usersCollection = db.collection("users");
    const propertyCollection = db.collection("property");
    const ordersCollection = db.collection("orders");
    const reviewCollection = db.collection("review");

    // --------------------------------------------------------VerifyAdmin--------------------------------------------------
    const verifyAdmin = async (req, res, next) => {
      // console.log('data from verifyToken middleware--->', req.user?.email)
      const email = req.user?.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "admin")
        return res
          .status(403)
          .send({ message: "Forbidden Access! Admin Only Actions!" });

      next();
    };

    // --------------------------------------------------------VerifySeller--------------------------------------------------
    const verifySeller = async (req, res, next) => {
      // console.log('data from verifyToken middleware--->', req.user?.email)
      const email = req.user?.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "agent")
        return res
          .status(403)
          .send({ message: "Forbidden Access! Agent Only Actions!" });

      next();
    };

    // -------------------------------------------------save user in database-----------------------------------------------
    app.post("/users/:email", async (req, res) => {
      sendEmail();
      const email = req.params.email;
      const query = { email };
      const user = req.body;
      // check if user exists in db
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        return res.send(isExist);
      }
      const result = await usersCollection.insertOne({
        ...user,
        role: "customer",
        timestamp: Date.now(),
      });
      res.send(result);
    });

    // ---------------------------------------------Manage user status and Role---------------------------------------------
    app.patch("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user?.status === "Requested")
        return res
          .status(400)
          .send("You have already requested, wait for some time.");

      const updateDoc = {
        $set: {
          status: "Requested",
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      console.log(result);
      res.send(result);
    });

    // ---------------------------------------------Get all User data--------------------------------------------------------
    app.get("/all-users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const query = { email: { $ne: email } };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // --------------------------------------------update a user role & status-------------------------------------------------
    app.patch(
      "/user/role/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const { role } = req.body;
        const filter = { email };
        const updateDoc = {
          $set: { role, status: "Verified" },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // ---------------------------------------------get inventory data for agent-----------------------------------------------
    app.get("/plants/seller", verifyToken, verifySeller, async (req, res) => {
      const email = req.user.email;
      const result = await propertyCollection
        .find({ "agent.email": email })
        .toArray();
      res.send(result);
    });

    // ---------------------------------------get all property data from DB----------------------------------------------------
    app.get("/plants/admin", verifyToken, verifyAdmin, async (req, res) => {
      const result = await propertyCollection.find().toArray();
      res.send(result);
    });

    // -----------------------------------------get all property from all user(Home)------------------------------------------------
    app.get("/all-property", async (req, res) => {
      const result = await propertyCollection.find().toArray();
      res.send(result);
    });

    // --------------------------------------------delete a property from db by seller----------------------------------------------
    app.delete("/plants/:id", verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await propertyCollection.deleteOne(query);
      res.send(result);
    });

    // -----------------------------------------------get user role-----------------------------------------------------------
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send({ role: result?.role });
    });

    // ----------------------------------------------get all user data----------------------------------------------------------
    app.get("/all-users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const query = { email: { $ne: email } };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // ----------------------------------------------Generate jwt token-----------------------------------------------------
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // -------------------------------------------------------Logout(Check JWT)---------------------------------------------------------
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // ---------------------------------------------------save a plant data in db---------------------------------------------
    app.post("/plants", verifyToken, verifySeller, async (req, res) => {
      const plant = req.body;
      const result = await propertyCollection.insertOne(plant);
      res.send(result);
    });

    // ----------------------------------------------get all property from db-------------------------------------------
    app.get("/plants", async (req, res) => {
      const result = await propertyCollection.find().limit(20).toArray();
      res.send(result);
    });

    // ----------------------------------------------get a property by id------------------------------------------------
    app.get("/plants/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await propertyCollection.findOne(query);
      res.send(result);
    });

    // ----------------------------------------------Save order data in db--------------------------------------------------
    app.post("/order", verifyToken, async (req, res) => {
      const orderInfo = req.body;
      console.log(orderInfo);
      const result = await ordersCollection.insertOne(orderInfo);
      // Send Email
      if (result?.insertedId) {
        // To Customer
        sendEmail(orderInfo?.customer?.email, {
          subject: "Order Successful",
          message: `You've placed an order successfully. Transaction Id: ${result?.insertedId}`,
        });

        // To Seller
        sendEmail(orderInfo?.agent, {
          subject: "Hurray!, You have an order to process.",
          message: `Get the plants ready for ${orderInfo?.customer?.name}`,
        });
      }
      res.send(result);
    });

    // Manage plant quantity todo-----<<>>>><<>>><<>>><<>><<>><<>><<>><<>>##
    // app.patch("/plants/quantity/:id", verifyToken, async (req, res) => {
    //   const id = req.params.id;
    //   // const { quantityToUpdate, status } = req.body;
    //   // const filter = { _id: new ObjectId(id) };
    //   // let updateDoc = {
    //   //   $inc: { quantity: -quantityToUpdate },
    //   // };
    //   // if (status === "increase") {
    //   //   updateDoc = {
    //   //     $inc: { quantity: quantityToUpdate },
    //   //   };
    //   // }
    //   const result = await propertyCollection.updateOne(filter, updateDoc);
    //   res.send(result);
    // });

    // ****************Help ChatGPT******************************
    // Endpoint to handle property order processing
    app.patch("/plants/quantity/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { address, customer, propertyId, price, agent, status } = req.body;

      try {
        // Save the order in the database
        const order = {
          customer,
          propertyId,
          price,
          agent,
          address,
          status,
          createdAt: new Date(),
        };

        // Insert the order into the orders collection
        const orderResult = await ordersCollection.insertOne(order);

        // Check if the order operation was successful
        if (orderResult.insertedId) {
          res.status(200).send({
            message: "Order placed successfully",
            orderId: orderResult.insertedId,
          });
        } else {
          res.status(400).send({ message: "Failed to place order" });
        }
      } catch (error) {
        console.error("Error processing order:", error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // Help chatGPT
    // ---------------------------------------------Get all orders for a specific customer---------------------------------------
    app.get("/customer-orders/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { "customer.email": email };

      try {
        const result = await ordersCollection
          .aggregate([
            {
              $match: { "customer.email": email }, // Match specific customer's data by email
            },
            {
              $addFields: {
                propertyId: { $toObjectId: "$propertyId" }, // Convert propertyId to ObjectId
              },
            },
            {
              $lookup: {
                from: "property", // Collection name
                localField: "propertyId", // Local field
                foreignField: "_id", // Foreign field in plants collection
                as: "propertyData", // Data will be returned as an array
              },
            },
            {
              $unwind: "$propertyData", // Convert array to object
            },
            {
              $addFields: {
                title: "$propertyData.title", // Add name field from plantData
                image: "$propertyData.image", // Add image field from plantData
                location: "$propertyData.location", // Add category field from plantData
              },
            },
            {
              $project: {
                propertyData: 0, // Exclude plantData from final result
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching customer orders:", error);
        res.status(500).send({ message: "Failed to fetch orders", error });
      }
    });

    // --------------------------------------------get all orders for a specific agent(Aggregate)------------------------------------
    app.get(
      "/seller-orders/:email",
      verifyToken,
      verifySeller,
      async (req, res) => {
        const email = req.params.email;
        const result = await ordersCollection
          .aggregate([
            {
              $match: { agent: email }, //Match specific customers data only by email
            },
            {
              $addFields: {
                propertyId: { $toObjectId: "$propertyId" }, //convert propertyId string field to objectId field
              },
            },
            {
              $lookup: {
                // go to a different collection and look for data
                from: "property", // collection name
                localField: "propertyId", // local data that i want to match
                foreignField: "_id", // foreign field name of that same data
                as: "plants", // return the data as plants array (array naming)
              },
            },
            { $unwind: "$plants" }, // unwind lookup result, return without array
            {
              $addFields: {
                // add these fields in order object
                title: "$plants.title",
              },
            },
            {
              // remove plants object property from order object
              $project: {
                plants: 0,
              },
            },
          ])
          .toArray();

        res.send(result);
      }
    );

    // ---------------------------------------------update a order status----------------------------------------------
    app.patch("/orders/:id", verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status },
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // ----------------------------------------------Cancel/delete an order----------------------------------------------
    app.delete("/orders/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const order = await ordersCollection.findOne(query);
      if (order.status === "Delivered")
        return res
          .status(409)
          .send("Cannot cancel once the product is delivered!");
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    });

    // --------------------------------------------------------Review section ---------------------------------------

    // ----------------------------------------------Get property by id----------------------------------------------
    app.get("/all-quires/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await propertyCollection.findOne(query);
      res.send(result);
    });

    // --------------------------------------------Add review by User/customer -----------------------------------------
    app.post("/add-recommended", async (req, res) => {
      const data = req.body;

      const result = await reviewCollection.insertOne(data);
      res.send(result);
    });

    // if a user already recommend in this Query ----->>
    // const query = { email: data.email, propertyId: data.propertyId };
    // const alreadyExist = await reviewCollection.findOne(query);
    // if (alreadyExist) {
    //   return res.status(400).send("You have already recommend on this query");
    // er por result er line
    // }
    // Increase recommend count in  RecommendCollection
    // const filter = { _id: new ObjectId(data.queryId) };
    // const update = {
    //   $inc: { recommendationCount: 1 },
    // };
    // const updateRecommendCount = await quiresCollection.updateOne(
    //   filter,
    //   update
    // );

    // --------------------------------------------GET Specific Review by Email-----------------------------------------------------
    app.get("/all-recommended/:email", async (req, res) => {
      const email = req.params.email;
      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }
      const query = { email };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    // --------------------------------------------GET All Recommended-----------------------------------------------------
    // TODO
    // app.get("/all-review", async (req, res) => {
    //   const result = await reviewCollection.find().toArray();
    //   res.send(result);
    // });

    // ------------------------------------------Delete Recommend by id---------------------------------------------------
    //  TODO
    //  app.delete("/recommend-delete/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await recommendedCollection.deleteOne(query);
    //   res.send(result);
    // });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

// ----------------------------------------MongoDB Connection ----------------------------------------

//Port run ------->>
app.get("/", (req, res) => {
  res.send("Real estate property sell Platform server is running ");
});

app.listen(port, () => {
  console.log("Port is running on port", port);
});
