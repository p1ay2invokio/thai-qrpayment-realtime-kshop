import { WebSocketServer } from 'ws'
import cors from 'cors'
import express, { raw } from 'express'
import { createServer } from 'http'
import { prisma } from './lib/prisma.ts'
import promptpay from 'promptpay-qr'
import { billPayment } from './node_modules/promptparse/dist/generate/index.js'
import QRCode from 'qrcode'
import dayjs from 'dayjs'

import { createKshopQRCode, generateKBankDynamicQR} from 'kbankshop-promtpay-generator'
const app = express()

app.use(cors())
app.use(express.json())

const server = createServer(app)


const wss = new WebSocketServer({ server })

const clients = new Map()

wss.on("connection", (ws, req: any) => {

    let url = new URL(req.url, 'http://localhost')
    let pid = url.searchParams.get("pid")

    if (pid) {
        clients.set(pid, ws)
    }

    console.log(pid)

    // clients.set(ws, {id: })

    ws.on('message', (msg) => {
        console.log(String(msg))

        ws.send("Server got your message!")
    })

    ws.on('close', () => clients.delete(pid))
})


app.get('/', (req, res) => {
    res.status(200).send("Hello World")
})

app.get("/qrcode/:id", async (req, res) => {
    let { id } = req.params

    let payment = await prisma.payment.findUnique({
        where: {
            id: id
        }
    })

    if (!payment) {
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


    let raw_res_qr = generateKBankDynamicQR('00020101021129390016A000000677010111031500499916832962053037645802TH630484EE', random_number)

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

// app.patch("/payment/:money", async (req, res) => {
//     let { money } = req.params

//     let payment = await prisma.payment.findUnique({
//         where: {
//             amount: parseFloat(money)
//         }
//     })

//     if (!payment) {
//         return res.status(404).send("Payment not found")
//     }

//     await prisma.payment.update({
//         where: {
//             amount: money
//         },
//         data: {
//             status: "paid"
//         }
//     })

//     const targetSocket = clients.get(money);

//     if(targetSocket && targetSocket.readyState == 1){
//         targetSocket.send(JSON.stringify({
//             status: 'paid',
//             message: "Payment Successful !"
//         }))
//     }

//     res.status(200).send("Payment updated successfully")
// })

app.post("/webhook", async (req, res) => {

    let { message } = req.body

    console.log("Come")
    console.log(message)

    let paid = message.split(" ")[5]

    let payment = await prisma.payment.findFirst({
        where: {
            amount: parseFloat(paid),
            status: 'pending'
        }
    })

    if (payment) {
        console.log(payment)

        await prisma.payment.update({
            where: {
                id: payment.id
            },
            data: {
                status: "paid"
            }
        })

        const targetSocket = clients.get(payment.id);

        if (targetSocket && targetSocket.readyState == 1) {
            targetSocket.send(JSON.stringify({
                status: 'paid',
                message: "Payment Successful !"
            }))
        }

        res.status(200).send("QRCode Payment Successfully!")


    }


})

server.listen(3001, () => {
    console.log(`Server is running on port 3001`)
})

