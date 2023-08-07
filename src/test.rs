#![cfg(test)]
extern crate std;
use std::println;

use super::*;
use soroban_sdk::{Env, Address, testutils::{Logs, Address as _}, log};
use token::AdminClient as TokenAdminClient;
use token::Client as TokenClient;

fn create_token_contract<'a>(e: &Env, admin: &Address) -> (TokenClient<'a>, TokenAdminClient<'a>) {
    let contract_address = e.register_stellar_asset_contract(admin.clone());
    (
        TokenClient::new(e, &contract_address),
        TokenAdminClient::new(e, &contract_address),
    )
}

#[test]
fn run_all() {
    let env = Env::default();
    env.mock_all_auths();

    let player = Address::random(&env);
    let admin = Address::random(&env);
    let contract_id = env.register_contract(None, Snooker);
    let snooker = SnookerClient::new(&env, &contract_id);
    let (payment_token, payment_token_admin) = create_token_contract(&env, &contract_id);
    let (reward_token, reward_token_admin) = create_token_contract(&env, &contract_id);

    log!(&env, "Contract ID {:?}", &contract_id);

    snooker.initialize(&admin, &payment_token.address, &10000000, &reward_token.address, &10000000);

    payment_token_admin.mint(&player, &10000000000);
    reward_token_admin.mint(&contract_id, &10000000000);
   
    let table = snooker.insertcoin(&player);
    println!("Table {:?}", &table);

    snooker.withdraw(&admin, &100000);

    let cue_balls = [
        Ball(6017, 6900, 1640, -5000),
        Ball(6099, 6949, 1718, -4765),
        Ball(6035, 6971, 1015, -2968),
        Ball(5875, 6875, 2187, -7812),
        Ball(6029, 5796, 1455, -10192),
        Ball(5994, 5876, -283, -6169),
        Ball(6042, 6918, 1796, -5312),
    ];
    //balls.push_back(Ball { x: 6000, y: 6000, vx: 0, vy: 0 });
    //pockets.push_back(Pocket { x: 6000, y: 2000 });

    let score = snooker.play(&player, &Vec::from_array(&env, cue_balls.clone()));

    println!("{:?}", env.budget());
    println!("{}", env.logs().all().join("\n"));

    assert_eq!(score, 0);
}