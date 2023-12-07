/*
   Date: August 2023
   Author: Fred Kyung-jin Rezeau <fred@litemint.com>
   MIT License
*/

#![no_std]

mod pool;

use soroban_macros::storage;
use soroban_tools::storage;

use pool::{Ball, Pocket, Pool};
use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype, token, vec, Address, Env,
    Vec,
};

contractmeta!(key="desc", val="A snooker game contract with pool physics validation, optional payments and rewards, on Soroban.");

const MAX_BALLS: u32 = 5;

#[contracttype]
pub enum DataKey {
    Admin,
    Table(Address),
    LedgerTime(Address),
}

#[storage(Temporary)]
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Table {
    pub balls: Vec<Ball>,
    pub pockets: Vec<Pocket>,
}

#[storage(Temporary)]
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub ledger_time: u64,
}

#[storage(Instance)]
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Admin {
    pub admin: Address,
    pub payment_token: Address,
    pub payment_amount: i128,
    pub reward_token: Address,
    pub reward_amount: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug)]
#[repr(u32)]
pub enum Error {
    NoAdmin = 1,
    AlreadyInitialized = 2,
    InvalidPoolTable = 3,
}

// Simple RNG for randomizing balls position on the table.
fn rand(x: &mut u64) -> u16 {
    *x ^= *x << 21;
    *x ^= *x >> 35;
    *x ^= *x << 4;
    // Use a bitmask to restrict the value to the range [0, 16383]
    let mask: u64 = (1 << 14) - 1; // 2^14 - 1 = 16383
    let masked_value = *x & mask;
    (masked_value as u16) % 5001 + 2500
}

#[contract]
struct Snooker;

pub trait SnookerTrait {
    fn insertcoin(env: Env, player: Address) -> Result<Table, Error>;
    fn play(env: Env, player: Address, cue_balls: Vec<Ball>) -> Result<u32, Error>;
    fn initialize(
        env: Env,
        admin: Address,
        payment_token: Address,
        payment_amount: i128,
        reward_token: Address,
        reward_amount: i128,
    ) -> Result<bool, Error>;
    fn withdraw(env: Env, account: Address, amount: i128) -> Result<i128, Error>;
}

#[contractimpl]
impl SnookerTrait for Snooker {
    fn insertcoin(env: Env, player: Address) -> Result<Table, Error> {
        if !storage::has::<DataKey, Admin>(&env, &DataKey::Admin) {
            return Err(Error::NoAdmin);
        }

        player.require_auth();

        // Pay contract if required.
        let admin_data = storage::get::<DataKey, Admin>(&env, &DataKey::Admin).unwrap();

        if admin_data.payment_amount > 0 {
            let token = token::Client::new(&env, &admin_data.payment_token);
            token.transfer(
                &player,
                &env.current_contract_address(),
                &admin_data.payment_amount,
            );
        }

        // Xorshift RNG is sufficient to randomize the snooker table objects.
        // Seed with ledger timestamp and sequence.
        let ledger = env.ledger();
        let mut seed = ledger.timestamp() + u64::from(ledger.sequence() + 1);
        let mut balls: Vec<Ball> = vec![&env];
        let mut pockets: Vec<Pocket> = vec![&env];
        for _i in 0..MAX_BALLS {
            balls.push_back(Ball(i128::from(rand(&mut seed)), 6000, 0, 0));
            pockets.push_back(Pocket(i128::from(rand(&mut seed)), 2000));
        }

        // Our game data is transient so we use the
        // cheaper temporary storage, no need for ESS.

        // Store the ledger timestamp.
        storage::set::<DataKey, Session>(
            &env,
            &DataKey::LedgerTime(player.clone()),
            &Session {
                ledger_time: ledger.timestamp(),
            },
        );

        // Store and return the table.
        let table_key = DataKey::Table(player.clone());
        let table = Table { balls, pockets };
        storage::set::<DataKey, Table>(&env, &table_key, &table);
        Ok(table)
    }

    fn play(env: Env, player: Address, cue_balls: Vec<Ball>) -> Result<u32, Error> {
        player.require_auth();

        // Retrieve the ledger timestamp.
        let stamp: u64 =
            storage::get::<DataKey, Session>(&env, &DataKey::LedgerTime(player.clone()))
                .unwrap()
                .ledger_time;

        // Retrieve the table.
        let table_key = &DataKey::Table(player.clone());
        let table: Table = storage::get::<DataKey, Table>(&env, &table_key).unwrap();

        // Some sanity check.
        if stamp + 180 < env.ledger().timestamp()
            || table.balls.len() < MAX_BALLS
            || table.pockets.len() < MAX_BALLS
        {
            return Err(Error::InvalidPoolTable);
        }

        storage::remove::<DataKey, Table>(&env, &table_key);

        // Implements basic scoring rules (not actual snooker) based on
        // the winning streak length. 147 still represents the maximum break.
        let mut score = 0;
        let mut streak = 0;
        for i in 0..MAX_BALLS {
            let cue_ball = cue_balls.get(i).unwrap();
            let ball = table.balls.get(i).unwrap();
            let pocket = table.pockets.get(i).unwrap();
            let mut pool = Pool(cue_ball, ball, pocket);

            // A ball is validated as potted if it collides with pocket
            // after transfer of momentum following collision with cue ball.
            if pool.is_potted(&env) {
                streak += 1;
                if score == 0 {
                    score += 12;
                }
            } else {
                streak = 0;
            }
            score += streak * 9;
            if i == MAX_BALLS - 1 {
                break;
            }
        }

        let admin_data = storage::get::<DataKey, Admin>(&env, &DataKey::Admin).unwrap();

        // Reward player for achieving maximum break (147).
        if score == 147 {
            if admin_data.reward_amount > 0 {
                let reward_contract: Address = admin_data.reward_token;
                let reward_token = token::Client::new(&env, &reward_contract);
                reward_token.transfer(
                    &env.current_contract_address(),
                    &player,
                    &admin_data.reward_amount,
                );
            }
        }

        Ok(score)
    }

    fn initialize(
        env: Env,
        admin: Address,
        payment_token: Address,
        payment_amount: i128,
        reward_token: Address,
        reward_amount: i128,
    ) -> Result<bool, Error> {
        if storage::has::<DataKey, Admin>(&env, &DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }

        storage::set::<DataKey, Admin>(
            &env,
            &DataKey::Admin,
            &Admin {
                admin,
                payment_token,
                payment_amount,
                reward_token,
                reward_amount,
            },
        );
        Ok(true)
    }

    fn withdraw(env: Env, account: Address, amount: i128) -> Result<i128, Error> {
        if !storage::has::<DataKey, Admin>(&env, &DataKey::Admin) {
            return Err(Error::NoAdmin);
        }

        let admin_data = storage::get::<DataKey, Admin>(&env, &DataKey::Admin).unwrap();

        admin_data.admin.require_auth();

        let reward_token = token::Client::new(&env, &admin_data.reward_token);
        let balance = reward_token.balance(&env.current_contract_address());
        if amount <= balance {
            reward_token.transfer(&env.current_contract_address(), &account, &amount);
        }
        Ok(balance)
    }
}

mod test;
