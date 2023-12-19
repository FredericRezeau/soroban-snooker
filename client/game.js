/*
   Date: August 2023
   Author: Fred Kyung-jin Rezeau <fred@litemint.com>
   MIT License
*/

// SnookerContract client.
(async function (namespace) {

    // Here, we handle all interactions with
    // the Soroban smart contract via Stellar transactions.
    const contractId = "CA7VJIGYO6OU5U5BQ77B6YAQDEQQ6E5U5OMVIG5XLHZKCHZLQA3N4Q7N"; // Admin: GDIWSQGU7P7GPFHAOZZMZZBYVQJNIRDCOZ3IAJID55T63XHI5COXPCH5

    // Set SnookerContract.localMode = true to emulate contract response locally.
    // Used in 'Drill mode'

    // Enter a valid secret seed if you need testing without Freighter.
    const testSecret = "S---ECRET";

    // Network settings.
    const networkPassphrase = "Test SDF Network ; September 2015";
    const rpcurl = "https://soroban-testnet.stellar.org:443";
    const server = new StellarSdk.SorobanRpc.Server(rpcurl, { allowHttp: true });

    let isBusy = false;
    let error = false;

    // Invoke the contract insertcoin method to setup
    // a new pool table for the player.
    // If no secret seed provided, attempt to sign with Freighter.
    namespace.insertCoin = async function (secretKey) {
        if (isBusy) return;

        isBusy = true;
        error = false;

        if (!namespace.localMode) {
            namespace.table = null;
            try {
                const keys = StellarSdk.StrKey.isValidEd25519SecretSeed(secretKey)
                    ? StellarSdk.Keypair.fromSecret(secretKey)
                    : null;

                const publicKey = keys ? keys.publicKey() : await freighterApi.getPublicKey();
                const account = await server.getAccount(publicKey);
                const contract = new StellarSdk.Contract(contractId);
                let transaction = new StellarSdk.TransactionBuilder(account, { fee: 1000000, networkPassphrase: networkPassphrase })
                    .addOperation(contract.call("insertcoin",
                        new StellarSdk.Address(publicKey).toScVal()))
                    .setTimeout(30)
                    .addMemo(StellarSdk.Memo.text("Soroban Snooker"))
                    .build();

                transaction = await server.prepareTransaction(transaction);

                // Sign.
                if (keys?.canSign()) {
                    transaction.sign(keys);
                }
                else {
                    const signedTransaction = await freighterApi.signTransaction(transaction.toEnvelope().toXDR("base64"), { networkPassphrase });
                    transaction = new StellarSdk.Transaction(signedTransaction, networkPassphrase);
                }

                // Submit and poll the response.
                let response = await server.sendTransaction(transaction);
                const txId = response.hash;
                while (response.status === "PENDING" || response.status === "NOT_FOUND") {
                    await sleep(1500);
                    response = await server.getTransaction(txId);
                }

                // Retrieve the table data (also persisted in temporary storage).
                if (response.status === "SUCCESS") {
                    const txMeta = StellarSdk.xdr.TransactionMeta.fromXDR(response.resultMetaXdr.toXDR().toString("base64"), "base64");
                    const sorobanMeta = txMeta.v3().sorobanMeta().returnValue();
                    const table = StellarSdk.scValToNative(sorobanMeta);
                    namespace.table = {
                        balls: table.balls.map(ball => ({ x: Number(ball[0]) / 1000, y: Number(ball[1]) / 1000, vx: 0, vy: 0 })),
                        pockets: table.pockets.map(pocket => ({ x: Number(pocket[0]) / 1000, y: Number(pocket[1]) / 1000 }))
                    };
                }
                else {
                    console.error(JSON.stringify(response));
                    error = true;
                }
            } catch (e) {
                console.error(e);
                error = true;
            }
        }
        else {
            // Build a table locally.
            namespace.table = { balls: [], pockets: [] };
            for (let i = 0; i < 5; i += 1) {
                namespace.table.balls.push({
                    "x": Math.random() * 5 + 2.5,
                    "y": 6,
                    "vx": 0,
                    "vy": 0
                });
                namespace.table.pockets.push({
                    "x": Math.random() * 5 + 2.5,
                    "y": 2
                });
            }
        }
        isBusy = false;
    };

    // Invoke the contract play method to validate the strikes and retrieve the score.
    // If no secret seed provided, attempt to sign with Freighter.
    namespace.play = async function (secretKey, strikes, wins) {
        if (isBusy) return;

        isBusy = true;
        error = false;
        namespace.score = 0;

        if (!namespace.localMode) {
            try {
                const keys = StellarSdk.StrKey.isValidEd25519SecretSeed(secretKey)
                    ? StellarSdk.Keypair.fromSecret(secretKey)
                    : null;

                const publicKey = keys ? keys.publicKey() : await freighterApi.getPublicKey();
                const cueballs = StellarSdk.nativeToScVal(strikes, { type: "i128" });
                const account = await server.getAccount(publicKey);
                const contract = new StellarSdk.Contract(contractId);
                let transaction = new StellarSdk.TransactionBuilder(account, { fee: 100000, networkPassphrase: networkPassphrase })
                    .addOperation(contract.call("play",
                        new StellarSdk.Address(publicKey).toScVal(),
                        cueballs))
                    .setTimeout(30)
                    .addMemo(StellarSdk.Memo.text("Soroban Snooker"))
                    .build();

                transaction = await server.prepareTransaction(transaction);

                // Sign.
                if (keys?.canSign()) {
                    transaction.sign(keys);
                }
                else {
                    const signedTransaction = await freighterApi.signTransaction(transaction.toEnvelope().toXDR("base64"), { networkPassphrase });
                    transaction = new StellarSdk.Transaction(signedTransaction, networkPassphrase);
                }

                // Submit and poll the response.
                let response = await server.sendTransaction(transaction);
                const txId = response.hash;
                while (response.status === "PENDING" || response.status === "NOT_FOUND") {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    response = await server.getTransaction(txId);
                }

                if (response.status === "SUCCESS") {
                    const meta = StellarSdk.xdr.TransactionMeta.fromXDR(response.resultMetaXdr.toXDR().toString("base64"), "base64");
                    const sorobanMeta = meta.v3().sorobanMeta().returnValue();
                    namespace.score = StellarSdk.scValToNative(sorobanMeta);
                }
                else {
                    console.error(JSON.stringify(response));
                    error = true;
                }
            } catch (e) {
                console.error(e);
                error = true;
            }
        }
        else {
            const pointsTable = [0, 21, 39, 66, 102, 147];
            namespace.score = pointsTable[wins];
        }
        isBusy = false;
    };

    // Some accessors.
    namespace.busy = () => isBusy;
    namespace.errored = () => error;
    namespace.networkPassphrase = () => networkPassphrase;
    namespace.testSecret = () => testSecret;

    namespace.clearError = () => {
        error = false;
    };

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

})(window.SnookerContract = window.SnookerContract || {});

// SorobanSnooker game client.
(async function (namespace) {

    // Here we implement a simple game client for the smart contract.

    // The game loop FPS is fixed (50 FPS) for added consistency with contract physics.
    // We could also to use a separate time-based loop for improving rendering smootheness.

    // Simple rendering on HTML5 canvas with vanilla javascript.

    // StrikeSolver ports the contract pool collisions from Rust fixed-point arithmetic.
    // The code has not been roughly tested so there may be some discrepencies
    // when compared to smart contract calculated results.

    const scale = 128; // 128x128 /sprites.png.
    const scaleReciprocal = 1 / scale;
    const ballRadius = 0.5;
    const ballDiameterSquared = 1;
    const fps = 1 / 50;
    const maxIter = 500; // To break strike animation if ball velocity is very small.

    let context, canvas;
    let strikesWon = 0;
    let currentStrike = 0;
    let completedStrikes = [];

    namespace.StrikeStatus = { Paused: 0, Running: 1, Success: 2, Failed: 3 };
    namespace.StageScreen = { Intro: 0, Menu: 1, Score: 2 };
    namespace.WalletStatus = { NotInstalled: 0, NotTestnet: 1, Connected: 2 };

    namespace.StrikeSolver = function () {
        if (!(this instanceof namespace.StrikeSolver)) {
            throw new Error("Constructor called as a function.");
        }
        this.reset();
    };

    namespace.StrikeSolver.prototype.reset = function (cueBall = { x: 5, y: 10, vx: 0, vy: 0 }, solidBall = { x: 2.5, y: 6, vx: 0, vy: 0 }, pocket = { x: 5, y: 3.8 }) {
        this.balls = [cueBall, solidBall];
        this.pocket = pocket;
        this.curIter = maxIter;
        this.status = namespace.StrikeStatus.Paused;
        this.completed = false;
        this.lastDist = Number.MAX_SAFE_INTEGER;
        this.pocketed = false;
    };

    namespace.StrikeSolver.prototype.update = function (elapsed) {
        if (this.status === namespace.StrikeStatus.Paused) return;

        for (const ball of this.balls) {
            ball.x += ball.vx * elapsed;
            ball.y += ball.vy * elapsed;
        }

        if (this.status === namespace.StrikeStatus.Running || this.status === namespace.StrikeStatus.Success) {
            this.applyCollisions();
        }
    };

    namespace.StrikeSolver.prototype.strike = function (originX, originY, targetX, targetY) {
        this.status = namespace.StrikeStatus.Running;

        const dist = distance(targetX, targetY, originX, originY);
        const x = dist > 1.5 ? targetX + (originX - targetX) / dist * 1.5 : originX;
        const y = dist > 1.5 ? targetY + (originY - targetY) / dist * 1.5 : originY;

        const cuePower = 6;
        this.balls[0].vx = (x - targetX) * cuePower;
        this.balls[0].vy = (y - targetY) * cuePower;
    }

    namespace.StrikeSolver.prototype.applyCollisions = function () {
        if (this.completed) return;

        if (this.status === namespace.StrikeStatus.Success) {
            const dx = this.pocket.x - this.balls[1].x;
            const dy = this.pocket.y - this.balls[1].y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared > this.lastDist) {
                this.pocketed = true;
                this.completed = true;
            }
            this.lastDist = distanceSquared;
        }
        else if ((this.balls[0].collided || !this.curIter) && this.status === namespace.StrikeStatus.Running) {
            const dx = this.balls[1].x * this.balls[1].vx * Number.MAX_SAFE_INTEGER - this.balls[1].x;
            const dy = this.balls[1].y * this.balls[1].vy * Number.MAX_SAFE_INTEGER - this.balls[1].y;
            const d = dx * (this.balls[1].y - this.pocket.y) - dy * (this.balls[1].x - this.pocket.x);
            const discriminant = ballRadius * 1.5 * ballRadius * 1.5 * (dx * dx + dy * dy) - d * d;
            this.status = discriminant >= 0 && this.balls[0].collided ? namespace.StrikeStatus.Success : namespace.StrikeStatus.Failed;
            if (namespace.StrikeStatus.Success !== this.status) {
                setTimeout(() => {
                    this.completed = true;
                }, 1000)
            }
            else {
                this.lastDist = Number.MAX_SAFE_INTEGER;
            }
        }
        else {
            const dx = this.balls[1].x - this.balls[0].x;
            const dy = this.balls[1].y - this.balls[0].y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared < ballDiameterSquared) {
                completedStrikes.push([
                    (Math.round(this.balls[0].x * 1000)),
                    (Math.round(this.balls[0].y * 1000)),
                    (Math.round(this.balls[0].vx * 1000)),
                    (Math.round(this.balls[0].vy * 1000))]);

                if (distanceSquared !== 0) {
                    const magInv = 1 / distanceSquared;
                    const nx = dx * magInv;
                    const ny = dy * magInv;
                    const rel = -this.balls[0].vx * nx - this.balls[0].vy * ny;
                    this.balls[0].vx += rel * nx;
                    this.balls[0].vy += rel * ny;
                    this.balls[1].vx -= rel * nx;
                    this.balls[1].vy -= rel * ny;
                }
                this.balls[0].collided = true;
            }

            if (distanceSquared > this.lastDist) {
                this.curIter = 1;
            }
            this.lastDist = distanceSquared;

            if (this.status === namespace.StrikeStatus.Running) {
                this.curIter -= 1;
                if (!this.curIter && !this.balls[0].collided) {
                    completedStrikes.push([0, 0, 0, 0]);
                }
            }
        }
    }

    namespace.StrikeSolver.prototype.getEntities = function () {
        return [...this.balls, this.pocket]
    };

    namespace.initialize = async () => {

        // Create the cameras.
        namespace.unitCamera = new LitemintEngine.Camera();
        namespace.primaryCamera = new LitemintEngine.Camera();
        namespace.secondaryCamera = new LitemintEngine.Camera();
        namespace.hudCamera = new LitemintEngine.Camera();

        // Initialize the canvas and retrieve the 2d context.
        canvas = document.getElementById("canvas");
        context = canvas.getContext("2d");

        // Listen to mouse/touch events.
        canvas.addEventListener("mousedown", handleStart);
        canvas.addEventListener("mousemove", handleMove);
        canvas.addEventListener("mouseup", handleEnd);
        canvas.addEventListener("touchstart", handleStart);
        canvas.addEventListener("touchmove", handleMove);
        canvas.addEventListener("touchend", handleEnd);

        // Setup the display resolution.
        namespace.resize();

        namespace.strikeSolver = new namespace.StrikeSolver();
        namespace.stageScreen = namespace.StageScreen.Intro;
        run();

        // Freighter wallet.
        if (!freighterApi || !await freighterApi.isConnected()) {
            namespace.walletStatus = namespace.WalletStatus.NotInstalled;
        }
        else {
            const networkDetails = await freighterApi.getNetworkDetails();
            if (networkDetails.networkPassphrase !== SnookerContract.networkPassphrase()) {
                namespace.walletStatus = namespace.WalletStatus.NotTestnet;
            }
            else {
                namespace.walletStatus = namespace.WalletStatus.Connected;
            }
        }
    };

    namespace.resize = () => {
        const gameWidth = 16;
        const gameHeight = 9;
        if (canvas) {
            const width = window.innerWidth;
            const height = window.innerHeight;
            namespace.scene = {
                x: 0,
                y: 0,
                height: 15,
                width: 10,
                margin: 1,
                isLandscape: width >= height
            };
            canvas.width = namespace.scene.isLandscape ? scale * gameWidth : scale * gameHeight;
            canvas.height = namespace.scene.isLandscape ? (scale * gameWidth * height / width) : (scale * gameHeight * height / width);
            canvas.style.width = width + "px";
            canvas.style.height = height + "px";
            namespace.ratio = { x: width / canvas.width, y: height / canvas.height };

            namespace.unitCamera.sx = scale;
            namespace.unitCamera.sy = scale;
            namespace.unitCamera.update();
            namespace.size = screenToHud({ x: canvas.width, y: canvas.height });
            namespace.unit = Math.max(namespace.size.x, namespace.size.y) * (namespace.scene.isLandscape ? 0.018 : 0.022);

            namespace.practiceBtn = {
                x: namespace.size.x * 0.5 - namespace.unit * 8.2,
                y: namespace.size.y * 0.5 - namespace.unit,
                width: namespace.unit * 8,
                height: namespace.unit * 4
            }

            namespace.insertCoinBtn = {
                x: namespace.size.x * 0.5 + namespace.unit * 0.2,
                y: namespace.size.y * 0.5 - namespace.unit,
                width: namespace.unit * 8,
                height: namespace.unit * 4
            }

            namespace.playDemoBtn = {
                x: namespace.size.x * 0.5 - namespace.unit * 4.05,
                y: namespace.size.y * 0.5 + namespace.unit * 9.5,
                width: namespace.unit * 8.1,
                height: namespace.unit * 2.7
            }

            namespace.closeBtn = {
                x: namespace.size.x * 0.5 - namespace.unit * 2.025,
                y: namespace.size.y * 0.5 + namespace.unit * 9.5,
                width: namespace.unit * 4.05,
                height: namespace.unit * 2.7
            }

            namespace.githubBtn = {
                x: namespace.size.x - namespace.unit * 8.1,
                y: 0,
                width: namespace.unit * 8.1,
                height: namespace.unit * 5.4
            }

            namespace.litemintBtn = {
                x: namespace.size.x - namespace.unit * 8,
                y: namespace.size.y - namespace.unit * 3.5,
                width: namespace.unit * 6.9,
                height: namespace.unit * 2.3
            }
        }
    }

    const touchStart = (coords) => {
        if (SnookerContract.busy() || SnookerContract.errored()) return;

        if (namespace.strikeSolver.status === namespace.StrikeStatus.Paused) {
            namespace.hudPoint = screenToHud(coords);
            namespace.hudPoint.isDown = true;

            let hudPoint = { x: namespace.hudPoint.x / namespace.ratio.x, y: namespace.hudPoint.y / namespace.ratio.y };
            if (isPointInRect(hudPoint, namespace.githubBtn)) {
                namespace.githubBtn.isDown = true;
            }
            else if (isPointInRect(hudPoint, namespace.litemintBtn)) {
                namespace.litemintBtn.isDown = true;
            }
            else if (namespace.stageScreen === namespace.StageScreen.Score) {
                if (isPointInRect(hudPoint, namespace.closeBtn)) {
                    namespace.closeBtn.isDown = true;
                }
            }
            else if (namespace.stageScreen === namespace.StageScreen.Intro) {
                if (isPointInRect(hudPoint, namespace.playDemoBtn)) {
                    namespace.playDemoBtn.isDown = true;
                }
            }
            else if (!SnookerContract.table) {
                if (isPointInRect(hudPoint, namespace.insertCoinBtn)) {
                    namespace.insertCoinBtn.isDown = true;
                }
                else if (isPointInRect(hudPoint, namespace.practiceBtn)) {
                    namespace.practiceBtn.isDown = true;
                }
            }
        }
    }

    const touchMove = (coords) => {
        if (SnookerContract.busy() || SnookerContract.errored()) return;

        const wasDown = namespace.hudPoint?.isDown;
        namespace.hudPoint = screenToHud(coords);
        namespace.hudPoint.isDown = wasDown;
    }

    const touchEnd = async () => {
        if (SnookerContract.busy()) return;

        if (SnookerContract.errored()) {
            SnookerContract.clearError();
        }

        if (namespace.hudPoint?.isDown) {
            let hudPoint = { x: namespace.hudPoint.x / namespace.ratio.x, y: namespace.hudPoint.y / namespace.ratio.y };
            namespace.hudPoint = null;
            if (isPointInRect(hudPoint, namespace.githubBtn) && namespace.githubBtn.isDown) {
                window.open("https://github.com/FredericRezeau/soroban-snooker", "_blank")
            }
            else if (isPointInRect(hudPoint, namespace.litemintBtn) && namespace.litemintBtn.isDown) {
                window.open("https://litemint.com", "_blank")
            }
            else if (namespace.stageScreen === namespace.StageScreen.Score) {
                if (isPointInRect(hudPoint, namespace.closeBtn)) {
                    namespace.stageScreen = namespace.StageScreen.Intro;
                }
            }
            else if (namespace.stageScreen === namespace.StageScreen.Intro) {
                if (isPointInRect(hudPoint, namespace.playDemoBtn) && namespace.playDemoBtn.isDown) {
                    namespace.stageScreen = namespace.StageScreen.Menu;
                    namespace.menuAnimTime = 1;
                }
            }
            else if (SnookerContract.table) {
                let entityPoint = screenToHud(sceneToScreen(namespace.strikeSolver.getEntities()[0]));
                namespace.strikeSolver.strike(entityPoint.x, entityPoint.y, hudPoint.x, hudPoint.y);
            }
            else if (isPointInRect(hudPoint, namespace.insertCoinBtn) && namespace.insertCoinBtn.isDown) {
                if (namespace.walletStatus === namespace.WalletStatus.Connected) {
                    SnookerContract.localMode = false;
                    await SnookerContract.insertCoin(SnookerContract.testSecret());
                    if (SnookerContract.table) {
                        strikesWon = 0;
                        currentStrike = 0;
                        completedStrikes = [];
                        namespace.strikeSolver.reset(
                            { x: 5, y: 10, vx: 0, vy: 0, color: "red" },
                            SnookerContract.table.balls[currentStrike],
                            SnookerContract.table.pockets[currentStrike]);
                    }
                }
            }
            else if (isPointInRect(hudPoint, namespace.practiceBtn) && namespace.practiceBtn.isDown) {
                SnookerContract.localMode = true;
                await SnookerContract.insertCoin();
                if (SnookerContract.table) {
                    strikesWon = 0;
                    currentStrike = 0;
                    completedStrikes = [];
                    namespace.strikeSolver.reset(
                        { x: 5, y: 10, vx: 0, vy: 0, color: "red" },
                        SnookerContract.table.balls[currentStrike],
                        SnookerContract.table.pockets[currentStrike]);
                }
            }

            namespace.closeBtn.isDown = false;
            namespace.playDemoBtn.isDown = false;
            namespace.litemintBtn.isDown = false;
            namespace.githubBtn.isDown = false;
            namespace.practiceBtn.isDown = false;
            namespace.insertCoinBtn.isDown = false;
        }
    }

    const updateFrame = async (elapsed) => {
        const resetStrike = () => {
            const entities = namespace.strikeSolver.getEntities();
            if (entities.length) {
                namespace.strikePos = { x: entities[0].x, y: entities[0].y };
                namespace.strikeAngle = 0;
                namespace.strikeDist = 0;
            }
        }

        namespace.sceneAngle = namespace.sceneAngle ?
            (namespace.sceneAngle + Math.PI * elapsed * (SnookerContract.table
                ? namespace.sceneAngle < Math.PI ? -2 : 2 : 0.02)) % (Math.PI * 2) : 0.03;
        if (SnookerContract.table && namespace.sceneAngle < Math.PI * 0.2) {
            namespace.sceneAngle = 0;
        }

        if (SnookerContract.table && namespace.strikeSolver.pocketed) {
            namespace.pocketedScale += elapsed * 0.3;
            namespace.pocketedScale = Math.min(0.1, namespace.pocketedScale);
        }
        else {
            namespace.pocketedScale = 0;
        }

        if (namespace.menuAnimTime) {
            namespace.menuAnimTime -= elapsed * 2.5;
            if (namespace.menuAnimTime < 0) {
                namespace.menuAnimTime = 0;
            }
        }
        else {
            namespace.menuAnimTime = 0;
        }

        updateCameras(elapsed);
        namespace.strikeSolver.update(elapsed);

        // 2023-08-08 - To improve visual feedback when potting the ball (especially when close to the edges)
        // we update its velocity to spiral it toward the pot center.
        const potBall = (ball, pocket) => {
            if (!pocket.target) {
                pocket.target = true;
                pocket.initialDistance = Math.sqrt((pocket.x - ball.x) ** 2 + (pocket.y - ball.y) ** 2);
                pocket.angle = 0;
                pocket.iterations = 0;
                pocket.angleIncrement = (2 * Math.PI * elapsed * Math.sqrt(ball.vx ** 2 + ball.vy ** 2)) / (pocket.initialDistance * 3);
                pocket.approachAngle = Math.atan2(pocket.y - ball.y, pocket.x - ball.x);
            }

            const spiralFactor = 0.1;
            pocket.iterations += 1;
            if (pocket.angle < 2 * Math.PI * pocket.initialDistance * 2) {
                const x = pocket.x + (pocket.initialDistance - spiralFactor * pocket.angle) * Math.cos(pocket.approachAngle - pocket.angle);
                const y = pocket.y + (pocket.initialDistance - spiralFactor * pocket.angle) * Math.sin(pocket.approachAngle - pocket.angle);
                ball.x = x;
                ball.y = y;
                ball.x += ball.vx * elapsed * 0.5;
                ball.y += ball.vy * elapsed * 0.5;
                pocket.angle += pocket.angleIncrement;
                return false;
            }
            else {
                ball.x = pocket.x;
                ball.y = pocket.y;
                return pocket.iterations > 50;
            }
        }

        const entities = namespace.strikeSolver.getEntities();
        if (namespace.strikeSolver.completed) {
            if (!namespace.strikeSolver.pocketed || potBall(entities[1], entities[2])) {
                currentStrike += 1;
                if (namespace.StrikeStatus.Success === namespace.strikeSolver.status) {
                    strikesWon += 1;
                }

                if (SnookerContract.table?.balls
                    && currentStrike < SnookerContract.table.balls.length) {
                    namespace.strikeSolver.reset(
                        { x: 5, y: 10, vx: 0, vy: 0 },
                        SnookerContract.table.balls[currentStrike],
                        SnookerContract.table.pockets[currentStrike]);
                }
                else {
                    SnookerContract.table = null;
                    namespace.strikeSolver.reset();
                    SnookerContract.play(SnookerContract.testSecret(), completedStrikes, strikesWon);
                    namespace.stageScreen = namespace.StageScreen.Score;
                    completedStrikes = [];
                    strikesWon = 0;
                }
                resetStrike();
            }
        }

        if (!namespace.strikePos) {
            resetStrike();
        }
    };

    const renderFrame = () => {
        context.save();
        renderBackground();
        renderScene();
        renderHud();
        context.restore();
    };

    const renderBackground = () => {
        context.save();
        context.setTransform.apply(context, namespace.unitCamera.matrix);
        context.transform.apply(context, namespace.hudCamera.matrix);
        context.fillStyle = "#147dbe";
        context.fillRect(0, 0, namespace.size.x, namespace.size.y);
        context.restore();
    }

    const renderBall = (ball, type) => {
        context.save();
        let drawRadius = ballRadius * 1.8;
        switch (type) {
            case "cueball":
                context.drawImage(namespace.sprites, scale, 0, scale * 3, scale * 3, ball.x - drawRadius, ball.y - drawRadius, drawRadius * 2, drawRadius * 2);
                break;
            case "colorball":
                drawRadius *= (1 - namespace.pocketedScale);
                context.drawImage(namespace.sprites, scale, scale * 3, scale * 3, scale * 3, ball.x - drawRadius, ball.y - drawRadius, drawRadius * 2, drawRadius * 2);
                break;
            case "pocket":
                drawRadius = ballRadius * 2.4;
                context.drawImage(namespace.sprites, scale * 4, 0, scale * 3, scale * 3, ball.x - drawRadius, ball.y - drawRadius, drawRadius * 2, drawRadius * 2);
                if (!SnookerContract.table) {
                    renderBall(ball, "colorball");
                }
                break;
        }
        context.restore();
    }

    const renderScene = () => {
        context.save();
        context.setTransform.apply(context, namespace.unitCamera.matrix);
        context.transform.apply(context, namespace.primaryCamera.matrix);
        context.transform.apply(context, namespace.secondaryCamera.matrix);
        context.translate(-namespace.secondaryCamera.x, -namespace.secondaryCamera.y);

        // Apply a rotation when menu is active.
        context.translate(namespace.scene.x + namespace.scene.width * 0.5, namespace.scene.y + namespace.scene.height * 0.5);
        context.rotate(namespace.sceneAngle)
        context.translate(-(namespace.scene.x + namespace.scene.width * 0.5), -(namespace.scene.y + namespace.scene.height * 0.5));

        // Scale up to cover most resolutions.
        context.save();
        context.translate(namespace.scene.x + namespace.scene.width * 0.5, namespace.scene.y + namespace.scene.height * 0.5);
        context.scale(5, 3)
        context.translate(-(namespace.scene.x + namespace.scene.width * 0.5), -(namespace.scene.y + namespace.scene.height * 0.5));

        // Fill the scene with a gradient.
        const gradient = context.createLinearGradient(0, 0, 0, namespace.scene.height);
        const colorStops = [
            { position: 0, color: "#074b7a" },
            { position: 0.5, color: "#147dbe" },
            { position: 1, color: "#074b7a" }
        ];
        for (const stop of colorStops) {
            gradient.addColorStop(stop.position, stop.color);
        }
        context.fillStyle = gradient;
        context.fillRect(namespace.scene.x, namespace.scene.y, namespace.scene.width, namespace.scene.height);

        // Add some noise to the table surface.
        // Not sure I achieved the effect I wanted here :)
        const noiseAmount = 1;
        if (!namespace.noise) {
            namespace.noise = [];
            for (let y = 0; y < namespace.scene.height; y += noiseAmount) {
                namespace.noise[y] = [];
                for (let x = 0; x < namespace.scene.width; x += noiseAmount) {
                    namespace.noise[y].push(Math.random() * 20 - 10);
                }
            }
        }

        for (let y = 0; y < namespace.scene.height; y += noiseAmount) {
            for (let x = 0; x < namespace.scene.width; x += noiseAmount) {
                const noise = namespace.noise[y][x];
                context.fillStyle = `rgba(255, 255, 255, ${Math.abs(noise) / 80})`;
                context.fillRect(x, y, noiseAmount, noiseAmount);
            }
        }

        // then some shadow.
        const shadowGradient = context.createLinearGradient(0, namespace.scene.height * 0.6, 0, namespace.scene.height);
        shadowGradient.addColorStop(0, "rgba(235, 160, 255, 0.02)");
        shadowGradient.addColorStop(1, "rgba(235, 160, 255, 0.02)");
        context.fillStyle = shadowGradient;
        context.fillRect(0, namespace.scene.height * 0.6, namespace.scene.width, namespace.scene.height * 0.4);
        context.restore();

        // Draw some details on the table (line, arc...)
        context.save();
        context.beginPath();
        context.moveTo(-namespace.scene.width, namespace.scene.height * 0.64);
        context.lineTo(namespace.scene.width * 2, namespace.scene.height * 0.64);
        context.strokeStyle = "rgba(255, 255, 255, 0.5)"; // White color for the line
        context.lineWidth = 0.015; // Adjust the line width if needed
        context.stroke();
        const radius = namespace.scene.width * 0.25;
        context.beginPath();
        context.arc(namespace.scene.width * 0.5, namespace.scene.height * 0.8 - radius, radius, 0, Math.PI, false);
        context.stroke();
        context.restore();

        const entities = namespace.strikeSolver.getEntities();
        if (entities.length) {
            renderBall(entities[2], "pocket");
            renderBall(entities[1], "colorball");
            renderBall(entities[0], "cueball");

            // Render the cue.            
            context.save();
            if (namespace.strikeSolver.status === namespace.StrikeStatus.Paused) {
                if (namespace.hudPoint?.isDown && SnookerContract.table) {
                    const entityPoint = screenToHud(sceneToScreen(entities[0]));
                    const hudPoint = { x: namespace.hudPoint.x / namespace.ratio.x, y: namespace.hudPoint.y / namespace.ratio.y };
                    namespace.strikeAngle = Math.atan2(hudPoint.y - entityPoint.y, hudPoint.x - entityPoint.x) - Math.PI * 0.5;
                    namespace.strikeDist = Math.min(1.5, distance(hudPoint.x, hudPoint.y, entityPoint.x, entityPoint.y));
                    namespace.strikePos = { x: entities[0].x, y: entities[0].y };
                }
            }
            context.translate(namespace.strikePos.x, namespace.strikePos.y);
            context.rotate(namespace.strikeAngle);
            context.translate(-namespace.strikePos.x, -namespace.strikePos.y);

            // Draw the guide line
            if (namespace.strikeSolver.status === namespace.StrikeStatus.Paused) {
                context.save();
                context.translate(entities[0].x, entities[0].y);
                context.rotate(Math.PI * 1.25);
                context.translate(-entities[0].x, -entities[0].y);
                context.beginPath();
                context.setLineDash([0.05, 0.05]);
                context.moveTo(entities[0].x, entities[0].y);
                context.lineTo(entities[0].x + 10, entities[0].y + 10);
                context.strokeStyle = "#fff";
                context.lineWidth = 0.02;
                context.stroke();
                context.restore();
            }

            context.translate(0, namespace.strikeSolver.status !== namespace.StrikeStatus.Paused ? -0.5 : namespace.strikeDist);
            context.drawImage(namespace.sprites, 0, 0, scale, scale * 8, namespace.strikePos.x - ballRadius * 2, namespace.strikePos.y, ballRadius * 4, ballRadius * 32);
            context.restore();
        }
        context.restore();
    }

    const renderHud = () => {
        context.save();
        context.setTransform.apply(context, namespace.unitCamera.matrix);
        context.transform.apply(context, namespace.hudCamera.matrix);

        if (!SnookerContract.table) {
            if (namespace.stageScreen === namespace.StageScreen.Menu) {
                context.save();
                context.translate(0, namespace.menuAnimTime * namespace.size.y);
                setupButtonScale(namespace.practiceBtn);
                context.drawImage(namespace.sprites, 0, scale * 8, scale * 4, scale * 2, namespace.practiceBtn.x, namespace.practiceBtn.y, namespace.practiceBtn.width, namespace.practiceBtn.height);
                context.restore();
                context.save();
                context.translate(0, namespace.menuAnimTime * namespace.size.y);
                setupButtonScale(namespace.insertCoinBtn);
                if (namespace.walletStatus !== namespace.WalletStatus.Connected) {
                    drawText("Need Freighter wallet", "rgb(130,240,255)", namespace.insertCoinBtn.x + namespace.insertCoinBtn.width * 0.5, namespace.insertCoinBtn.y + namespace.unit * 4.7, 0.65);
                    drawText("on Testnet to play", "rgb(130,240,255)", namespace.insertCoinBtn.x + namespace.insertCoinBtn.width * 0.5, namespace.insertCoinBtn.y + namespace.unit * 5.7, 0.65);
                    context.globalAlpha = 0.3;
                }
                context.drawImage(namespace.sprites, scale * 4, scale * 8, scale * 4, scale * 2, namespace.insertCoinBtn.x, namespace.insertCoinBtn.y, namespace.insertCoinBtn.width, namespace.insertCoinBtn.height);
                context.restore();
            }
            else if (!SnookerContract.busy()) {
                drawRoundRect("0, 0, 0", 0.5, namespace.size.x * 0.5 - namespace.unit * 9, namespace.size.y * 0.5 - namespace.unit * 4.5, namespace.unit * 18, namespace.unit * 14, namespace.unit * 0.5);
                if (namespace.stageScreen === namespace.StageScreen.Intro) {
                    drawText("SMART CONTRACT FEATURES", "rgb(255,70,211)", namespace.size.x * 0.5, namespace.size.y * 0.5 - namespace.unit * 3.2, 0.75, true);
                    drawText("In-app purchase & NFT reward", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 - namespace.unit * 1, 0.75);
                    drawText("Gameplay validation", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 + namespace.unit * 0.5, 0.75);
                    drawText("(pool physics, time-based...)", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 + namespace.unit * 1.5, 0.75);
                    drawText("Admin and auth", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 + namespace.unit * 3, 0.75);
                    drawText("(game assets, withdrawals...)", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 + namespace.unit * 4, 0.75);
                    drawText("Soroban Storage", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 + namespace.unit * 5.5, 0.75);
                    drawText("(temporary, persistent, instance)", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 + namespace.unit * 6.5, 0.75);
                    drawText("Custom types and more...", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 + namespace.unit * 8, 0.75);

                    context.save();
                    setupButtonScale(namespace.playDemoBtn);
                    context.drawImage(namespace.sprites, scale * 1, scale * 6, scale * 6, scale * 2, namespace.playDemoBtn.x, namespace.playDemoBtn.y, namespace.playDemoBtn.width, namespace.playDemoBtn.height);
                    context.restore();
                }
                else {
                    drawText("YOUR SCORE", "rgb(130,240,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 - namespace.unit * 1, 1.2, true);
                    drawText(`${SnookerContract.score}`, "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 + namespace.unit * 3, 4, true);

                    context.save();
                    setupButtonScale(namespace.closeBtn);
                    context.drawImage(namespace.sprites, scale * 7, scale * 6, scale * 3, scale * 2, namespace.closeBtn.x, namespace.closeBtn.y, namespace.closeBtn.width, namespace.closeBtn.height);
                    context.restore();
                }
            }
            context.drawImage(namespace.sprites, scale * 4, scale * 4, scale * 6, scale * 2, namespace.size.x * 0.5 - namespace.unit * 8, namespace.size.y * 0.5 - namespace.unit * 11.5, namespace.unit * 16, namespace.unit * 5.35);
            drawText("Showcasing web3 gaming with Soroban on Stellar", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 - namespace.unit * 5.8, 0.8);
        }
        else {
            context.drawImage(namespace.sprites, scale * 4, scale * 4, scale * 6, scale * 2, namespace.size.x * 0.015, namespace.size.y - namespace.unit * 3.5, namespace.unit * 8, namespace.unit * 2.675);
            drawText("TAP + HOLD TO ADJUST POWER AND DIRECTION", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y - namespace.unit * 3.7, 0.5);
            drawText("RELEASE TO SHOOT", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y - namespace.unit * 2.7, 0.5);
            drawText(`BALL ${currentStrike + 1}/5`, "rgb(255,255,255)", namespace.unit, namespace.unit, 0.9, true, "start");
        }

        context.save();
        setupButtonScale(namespace.litemintBtn);
        context.drawImage(namespace.sprites, scale * 4, scale * 3, scale * 3, scale, namespace.litemintBtn.x, namespace.litemintBtn.y, namespace.litemintBtn.width, namespace.litemintBtn.height);
        context.restore();
        context.drawImage(namespace.sprites, scale * 7, 0, scale * 3, scale * 2, namespace.githubBtn.x, namespace.githubBtn.y, namespace.githubBtn.width, namespace.githubBtn.height);
        context.drawImage(namespace.sprites, scale * 7, scale * 2, scale * 3, scale * 2, namespace.size.x - namespace.unit * 7.5, namespace.unit * (3.5 + oscillate(1000) * 0.5), namespace.unit * 7.5, namespace.unit * 5);

        if (SnookerContract.busy()) {
            context.fillStyle = "rgba(0, 0, 0, 0.6)";
            context.fillRect(0, 0, namespace.size.x, namespace.size.y);
            drawText(`CALLING SMART CONTRACT, PLEASE WAIT...`, "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.7, 1, true);
        }

        if (SnookerContract.errored()) {
            context.fillStyle = "rgba(0, 0, 0, 0.7)";
            context.fillRect(0, 0, namespace.size.x, namespace.size.y);
            drawRoundRect("255, 0, 0", 0.5, namespace.size.x * 0.5 - namespace.unit * 9, namespace.size.y * 0.5 - namespace.unit * 2.5, namespace.unit * 18, namespace.unit * 4, namespace.unit * 0.5);
            drawText("AN ERROR OCCURED", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 - namespace.unit, 0.75, true);
            drawText("Try again or check console.", "rgb(255,255,255)", namespace.size.x * 0.5, namespace.size.y * 0.5 + namespace.unit * 0.2, 0.75, false);
        }

        context.restore();
    }

    const screenToHud = (point) => {
        const camera = new LitemintEngine.Camera();
        camera.multiply(namespace.unitCamera);
        camera.multiply(namespace.hudCamera);
        return camera.screenToCamera(point.x, point.y);
    };

    const sceneToScreen = (point) => {
        const camera = new LitemintEngine.Camera();
        camera.multiply(namespace.unitCamera);
        camera.multiply(namespace.primaryCamera);
        camera.multiply(namespace.secondaryCamera);
        camera.translate(-namespace.secondaryCamera.x, -namespace.secondaryCamera.y);
        return camera.cameraToScreen(point.x, point.y);
    };

    const updateCameras = (elapsed) => {
        const cameraBaseSpeed = 2;
        const zoomSpeed = 1;
        const camera = new LitemintEngine.Camera();
        camera.multiply(namespace.unitCamera);
        const size = camera.screenToCamera(canvas.width, canvas.height);

        // Calculate the camera target.
        namespace.cameraTarget = {
            x: namespace.scene.x + namespace.scene.width * 0.5,
            y: namespace.scene.y + namespace.scene.height * 0.5,
            zoom: Math.min(
                namespace.scene.isLandscape ?
                    size.y / (namespace.scene.height + namespace.scene.margin) :
                    size.y / (namespace.scene.height + namespace.scene.margin),
                namespace.scene.isLandscape ?
                    size.x / (namespace.scene.width + namespace.scene.margin) :
                    size.x / (namespace.scene.width + namespace.scene.margin))
        };

        namespace.cameraTarget.zoom *= SnookerContract.table && !namespace.sceneAngle ? 1.1 : 1.6;

        // Reset the translation.
        let x = namespace.primaryCamera.x;
        let y = namespace.primaryCamera.y;
        namespace.primaryCamera.x = 0;
        namespace.primaryCamera.y = 0;
        namespace.primaryCamera.update();

        // Position the target at the center of the canvas.
        namespace.primaryCamera.tx = size.x / 2 - namespace.cameraTarget.x;
        namespace.primaryCamera.ty = size.y / 2 - namespace.cameraTarget.y;
        const dist = distance(x, y, namespace.primaryCamera.tx, namespace.primaryCamera.ty);
        if (Math.abs(dist) > 0.001) {
            x += elapsed * dist * 3 * cameraBaseSpeed * (namespace.primaryCamera.tx - x) / dist;
            y += elapsed * dist * 3 * cameraBaseSpeed * (namespace.primaryCamera.ty - y) / dist;
        }
        else {
            x = namespace.primaryCamera.tx;
            y = namespace.primaryCamera.ty;
        }
        namespace.primaryCamera.x = x;
        namespace.primaryCamera.y = y;

        // Secondary camera is used to separately control scene translation and zoom.
        namespace.secondaryCamera.x = size.x / 2 - x;
        namespace.secondaryCamera.y = size.y / 2 - y;
        if (namespace.secondaryCamera.sx > namespace.cameraTarget.zoom) {
            namespace.secondaryCamera.sx -= zoomSpeed * elapsed;
            if (namespace.secondaryCamera.sx < namespace.cameraTarget.zoom) {
                namespace.secondaryCamera.sx = namespace.cameraTarget.zoom;
            }
        }
        if (namespace.secondaryCamera.sx < namespace.cameraTarget.zoom) {
            namespace.secondaryCamera.sx += zoomSpeed * elapsed;
            if (namespace.secondaryCamera.sx > namespace.cameraTarget.zoom) {
                namespace.secondaryCamera.sx = namespace.cameraTarget.zoom;
            }
        }
        namespace.secondaryCamera.sy = namespace.secondaryCamera.sx;

        // Update everything.
        namespace.primaryCamera.update();
        namespace.secondaryCamera.update();
        namespace.hudCamera.update();
    }

    const distance = (x1, y1, x2, y2) => {
        const xd = x2 - x1;
        const yd = y2 - y1;
        return Math.sqrt(xd * xd + yd * yd);
    };

    const isPointInRect = (pt, rect) => {
        return pt.x >= rect.x && pt.x <= rect.x + rect.width && pt.y >= rect.y && pt.y <= rect.y + rect.height;
    }

    function run() {
        // Reset the context to identity matrix and clear.
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Setup the font.
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "40px Roboto";

        // Game loop.
        updateFrame(fps);
        renderFrame();
        window.requestAnimationFrame(run);
    }

    function handleStart(event) {
        event.preventDefault();
        touchStart(
            (event.type === "touchstart")
                ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
                : { x: event.clientX, y: event.clientY });
    }

    function handleMove(event) {
        event.preventDefault();
        touchMove(
            (event.type === "touchmove")
                ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
                : { x: event.clientX, y: event.clientY });
    }

    function handleEnd(event) {
        event.preventDefault();
        touchEnd();
    }

    function oscillate(offset) {
        return (t => (Math.abs((t % 4) - 2) - 1) * 0.02 + 1 - Math.abs((t % 2) - 1).toFixed(2))((Date.now() + offset) / 1000)
    }

    function drawText(text, color, x, y, scale, bold, align) {
        context.save();
        context.translate(x, y);
        context.scale(scaleReciprocal * scale, scaleReciprocal * scale);
        context.translate(-x, -y);
        context.textAlign = align || "center";
        if (bold) {
            context.font = "bold 40px Roboto";
        }
        context.fillStyle = color;
        context.fillText(text, x, y);
        context.restore();
    }

    function drawRoundRect(color, alpha, x, y, width, height, radius) {
        context.beginPath();
        context.moveTo(x + radius, y);
        context.arcTo(x + width, y, x + width, y + height, radius);
        context.arcTo(x + width, y + height, x, y + height, radius);
        context.arcTo(x, y + height, x, y, radius);
        context.arcTo(x, y, x + width, y, radius);
        context.closePath();
        context.fillStyle = `rgba(${color}, ${alpha})`;
        context.fill();
    }

    function setupButtonScale(button) {
        if (button.isDown) {
            context.translate(button.x + button.width * 0.5, button.y + button.height * 0.5);
            context.scale(0.95, 0.95);
            context.translate(-(button.x + button.width * 0.5), -(button.y + button.height * 0.5));
        }
    }
})(window.SorobanSnooker = window.SorobanSnooker || {});

document.addEventListener("DOMContentLoaded", function () {
    window.addEventListener("resize", (event) => {
        SorobanSnooker.resize();
    });

    SorobanSnooker.sprites = new Image();
    SorobanSnooker.sprites.onload = () => {
        SorobanSnooker.initialize();
    };
    SorobanSnooker.sprites.src = "sprites.png";
});