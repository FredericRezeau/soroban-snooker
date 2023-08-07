/*
   Date: August 2023
   Author: Fred Kyung-jin Rezeau <fred@litemint.com>
   MIT License
*/

#![no_std]

mod pool;

use soroban_sdk::{contract, contractimpl, contracttype, contracterror, contractmeta, token, Env, vec, Vec, Address};
use pool::{Ball, Pocket, Pool};

contractmeta!(key="desc", val="A snooker game contract with pool physics validation, optional payments and rewards, on Soroban.");

#[contract]
pub struct Snooker;

const MAX_BALLS: u32 = 5;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Table {
    pub balls: Vec<Ball>,
    pub pockets: Vec<Pocket>,
}

#[contracttype]
pub enum DataKey {
    Admin,
    PaymentToken,
    PaymentAmount,
    RewardToken,
    RewardAmount,
    LedgerTime(Address),
    Table(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug)]
#[repr(u32)]
pub enum Error {
    NoAdmin = 1,
    AlreadyInitialized = 2,   
    InvalidPoolTable = 3,
}

#[contractimpl]
impl Snooker {

    pub fn insertcoin(env: Env, player: Address) -> Result<Table, Error> {

        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NoAdmin)
        }

        player.require_auth();
        
        // Pay contract if required.
        let payment_amount: i128 = env.storage().instance().get(&DataKey::PaymentAmount).unwrap();
        if payment_amount > 0 {
            let payment_contract: Address = env.storage().instance().get(&DataKey::PaymentToken).unwrap();
            let token = token::Client::new(&env, &payment_contract);
            token.transfer(&player, &env.current_contract_address(), &payment_amount);
        }

        // Xorshift RNG is sufficient to randomize the snooker table objects.
        // Seed with ledger timestamp and sequence.
        let ledger = env.ledger();
        let mut seed = ledger.timestamp() + u64::from(ledger.sequence() + 1);
        let mut balls: Vec<Ball> = vec![&env];
        let mut pockets: Vec<Pocket> = vec![&env];
        for _i in 0..MAX_BALLS {
           balls.push_back(Ball(i128::from(Self::rand(&mut seed)), 6000, 0, 0));
           pockets.push_back(Pocket(i128::from(Self::rand(&mut seed)), 2000));
        }

        // Our game data is transient so we use the
        // cheaper temporary storage, no need for ESS.

        // Store the ledger timestamp.
        let ledger_key = DataKey::LedgerTime(player.clone());
        env.storage().temporary().set(&ledger_key, &ledger.timestamp());   

        // Store and return the table.
        let table_key = DataKey::Table(player.clone());
        let table = Table { balls, pockets };
        env.storage().temporary().set(&table_key, &table);
        Ok(table)
    }
    
    pub fn play(env: Env, player: Address, cue_balls: Vec<Ball>) -> Result<u32, Error> {

        player.require_auth();

        // Retrieve the ledger timestamp.
        let ledger_key = DataKey::LedgerTime(player.clone());
        let stamp: u64 = env.storage().temporary().get(&ledger_key).unwrap();

        // Retrieve the table.
        let table_key = DataKey::Table(player.clone());
        let table: Table = env.storage().temporary().get(&table_key).unwrap();

        // Some sanity check.
        if !env.storage().temporary().has(&table_key)
            || !env.storage().temporary().has(&ledger_key)
            || stamp + 180 < env.ledger().timestamp()
            || table.balls.len() < MAX_BALLS
            || table.pockets.len() < MAX_BALLS {
            return Err(Error::InvalidPoolTable)
        }

        env.storage().temporary().remove(&table_key);

        // Implements basic scoring rules (not actual snooker) based on
        // the winning streak length. 147 still represents the maximum break.
        let mut score = 0;
        let mut streak = 0;
        for i in 0..MAX_BALLS {
            let cue_ball = cue_balls.get(i).unwrap();
            let ball = table.balls.get(i).unwrap();
            let pocket = table.pockets.get(i).unwrap();
            let mut pool = Pool (cue_ball, ball, pocket);

            // A ball is validated as potted if it collides with pocket
            // after transfer of momentum following collision with cue ball.
            if pool.is_potted(&env) {
                streak += 1;
                if score == 0 {
                    score += 12;
                }                
            }
            else {
                streak = 0;
            }
            score += streak * 9;
            if i == MAX_BALLS - 1 {
                break;
            }
        }

        // Reward player for achieving maximum break (147).
        if score == 147 {
            let reward_amount: i128 = env.storage().instance().get(&DataKey::RewardAmount).unwrap();
            if reward_amount > 0 {
                let reward_contract: Address = env.storage().instance().get(&DataKey::RewardToken).unwrap();
                let reward_token = token::Client::new(&env, &reward_contract);
                reward_token.transfer(&env.current_contract_address(), &player, &reward_amount);
            }
        }

        Ok(score)
    }

    pub fn initialize(env: Env, admin: Address, payment_token: Address, payment_amount: i128, reward_token: Address, reward_amount: i128) -> Result<bool, Error> {

        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized)
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentToken, &payment_token);
        env.storage().instance().set(&DataKey::PaymentAmount, &payment_amount);        
        env.storage().instance().set(&DataKey::RewardToken, &reward_token);
        env.storage().instance().set(&DataKey::RewardAmount, &reward_amount);
        Ok(true)
    }

    pub fn withdraw(env: Env, account: Address, amount: i128) -> Result<i128, Error> {

        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NoAdmin)
        }

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let reward_contract: Address = env.storage().instance().get(&DataKey::RewardToken).unwrap();
        let reward_token = token::Client::new(&env, &reward_contract);
        let balance = reward_token.balance(&env.current_contract_address());
        if amount <= balance {
            reward_token.transfer(&env.current_contract_address(), &account, &amount);
        }
        Ok(balance)
    }

    // Simple RNG for randomizing balls position on the table.
    fn rand(x: &mut u64) -> u16 {
        *x ^= *x << 21;
        *x ^= *x >> 35;
        *x ^= *x << 4;
        // Use a bitmask to restrict the value to the range [0, 16383]
        let mask: u64 = (1 << 14) - 1; // 2^14 - 1 = 16383
        let masked_value = *x & mask;
        (masked_value as u16) % 5001  + 2500
    }
}

mod test;