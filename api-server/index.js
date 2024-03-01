const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const cors = require('cors');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');

const app = express();
const PORT = 9000;

const subscriber = new Redis('rediss://default:AVNS_vgAQ8p1w5r34TSx-qE8@redis-1f192fe7-ariea-auto-deployment.a.aivencloud.com:20543')

const io = new Server({ cors: '*' })

const prisma = new PrismaClient({})

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})

io.listen(9001, ()=>console.log('Socket Server 9001'))

const ecsClient = new ECSClient({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: 'AKIAYDNCXJUO67OVNJ6H',
        secretAccessKey: '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'
    }
})

const config = {
    CLUSTER: 'arn:aws:ecs:ap-south-1:557076401437:cluster/ariea-builder-cluster',
    TASK: 'arn:aws:ecs:ap-south-1:557076401437:task-definition/ariea-builder-task'
}

app.use(express.json());

// app.post('/project',async (req, rees) => {
//     const schema = z.object({
//         name: z.string(),
//         gitURL: z.string()
//     })
//     const safeParseresult = schema.safeParse(req.body)

//     if(safeParseresult.error){
//         return res.status(400).json({
//             error: safeParseresult.error
//         })
//     }

//     const { name, gitURL } = req.body

//     const project = await prisma.project.create({
//         data: {
//             name, 
//             gitURL,
//             subDomain: generateSlug()
//         }
//     })
//     return res.json({ status: "success", data: { project }})
// })

app.post('/project', async (req, res) => {
    const { gitUrl, slug } = req.body
    const projectSlug = slug ? slug : generateSlug()

    //Spin the container
    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: ['subnet-03394b1cca56b167e', 'subnet-0df77d295047748bd', 'subnet-0c96eaf2c6418d53b'],
                securityGroups: ['sg-0aaa724688985270e']
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: 'ariea-builder-image',
                    environment: [
                        {name: 'GIT_REPOSITORY__URL', value: gitUrl},
                        {name: 'PROJECT_ID', value: projectSlug}
                    ]
                }
            ]
        }
    })

    await ecsClient.send(command);

    return res.json({ status: 'queued', data: {projectSlug, url: `http://${projectSlug}.localhost:8000`} })
})

async function initRedisSubscribe() {
    console.log('Subscribed to logs...')
    subscriber.psubscribe('logs:*')
    subscriber.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message)
    })
}

initRedisSubscribe()

app.listen(PORT, () => console.log(`API Server Running On ${PORT}`));