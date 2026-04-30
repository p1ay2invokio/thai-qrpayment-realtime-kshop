import { WebSocketServer } from 'ws'
import cors from 'cors'
import express, { raw } from 'express'
import { createServer } from 'http'
import { prisma } from './lib/prisma.ts'
import promptpay from 'promptpay-qr'
import { billPayment } from './node_modules/promptparse/dist/generate/index.js'
import QRCode from 'qrcode'
import dayjs from 'dayjs'

import { createKshopQRCode } from 'kbankshop-promtpay-generator'
const app = express()

app.use(cors())
app.use(express.json())

const server = createServer(app)


const wss = new WebSocketServer({ server })

const clients = new Map()

wss.on("connection", (ws, req:any) => {

    let url = new URL(req.url, 'http://localhost')
    let pid = url.searchParams.get("pid")

    if(pid){
        clients.set(pid, ws)
    }

    console.log(pid)

    // clients.set(ws, {id: })

    ws.on('message', (msg) => {
        console.log(String(msg))

        ws.send("Server got your message!")
    })

    ws.on('close', ()=> clients.delete(pid))
})


app.get('/', (req, res) => {
    res.status(200).send("Hello World")
})

app.get("/qrcode/:id", async(req, res)=>{
    let { id } = req.params

    let payment = await prisma.payment.findUnique({
        where: {
            id: id
        }
    })

    if(!payment){
        return res.status(404).send("Payment not found")
    }

    res.status(200).send({ success: true, qr: payment.qrcode, amount: payment.amount, status: payment.status, expire: payment.expireAt })
})

app.post("/qrcode", async (req, res) => {

    let { amount } = req.body

    let random = Math.floor(Math.random() * 100)

    console.log("random : ", random)

    let random_number = Number(`${amount}.${random}`)

    console.log("Random Number : ", random_number)

    let duplicate_payment = await prisma.payment.findFirst({
        where: {
            amount: random_number
        }
    })

    if (duplicate_payment) {
        return res.status(400).send("Duplicate payment")
    }


    let raw_res_qr = createKshopQRCode('0002010102110216478772000426938104155303920004269641531343007640052044640122208300000130810016A00000067701011201150107536000315010214KB0000020913060320KPS004KB00000209130631690016A00000067701011301030040214KB0000020913060420KPS004KB00000209130651430014A000000004101001064169710211123456789015204549953037645406150.005802TH5910PLAY2STORE6004CITY6225050946117914107084220830063042A1F', random_number)

    console.log("Raw QR : ", raw_res_qr)

    let new_data = await prisma.payment.create({
        data: {
            qrcode: raw_res_qr,
            amount: random_number,
            status: "pending",
            expireAt: dayjs().add(5, 'minute').toDate()
        }
    })

    res.status(200).send({ success: true, qr: raw_res_qr, id: new_data.id })
})

app.patch("/payment/:id", async (req, res) => {
    let { id } = req.params

    let payment = await prisma.payment.findUnique({
        where: {
            id: id
        }
    })

    if (!payment) {
        return res.status(404).send("Payment not found")
    }

    await prisma.payment.update({
        where: {
            id: id
        },
        data: {
            status: "paid"
        }
    })
    
    const targetSocket = clients.get(id);

    if(targetSocket && targetSocket.readyState == 1){
        targetSocket.send(JSON.stringify({
            status: 'paid',
            message: "Payment Successful !"
        }))
    }

    res.status(200).send("Payment updated successfully")
})


server.listen(3001, () => {
    console.log(`Server is running on port 3001`)
})

