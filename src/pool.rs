/*
   Date: August 2023
   Author: Fred Kyung-jin Rezeau <fred@litemint.com>
   MIT License
*/

use soroban_sdk::{contracttype, Env};

#[derive(Clone, Copy, Debug)]
#[contracttype]
pub struct Ball(pub i128, pub i128, pub i128, pub i128);
// Destructure as Ball(position_x, position_y, velocity_x, velocity_y)

#[derive(Clone, Copy, Debug)]
#[contracttype]
pub struct Pocket(pub i128, pub i128);
// Destructure as Pocket(position_x, position_y)

pub struct Pool {
    pub cue_ball: Ball,
    pub color_ball: Ball,
    pub pocket: Pocket,
}

impl Pool {
    pub fn is_potted(&mut self, _env: &Env) -> bool {
        // In this function, we implement a simple (no friction, no cushion...)
        // physics simulation to determine whether the color ball was potted.

        // Collision detection.
        // Since we are running in contract environment, we avoid expensive
        // square root calculation by directly comparing squared values.
        let diameter_squared = 1000000;
        let radius_squared = 562500; // 4 x squared radius x 1.5

        let xd = self.color_ball.0 - self.cue_ball.0;
        let yd = self.color_ball.1 - self.cue_ball.1;
        let distance_squared = xd * xd + yd * yd;
        if distance_squared < diameter_squared {
            if distance_squared != 0 {
                // Momentum exchange.
                // left shift for fixed-point arithmetic.
                let mag_inv = (1 << 36) / distance_squared;
                let nx = xd * mag_inv;
                let ny = yd * mag_inv;
                let rel = -self.cue_ball.2 * nx - self.cue_ball.3 * ny;
                self.cue_ball.2 += (rel * nx) >> 36;
                self.cue_ball.3 += (rel * ny) >> 36;
                self.color_ball.2 -= (rel * nx) >> 36;
                self.color_ball.3 -= (rel * ny) >> 36;
            }

            // Potting.
            // Detect that the color_ball collides with the pocket after velocity adjustment.
            let dx = self.color_ball.0 * self.color_ball.2 * 5 - self.color_ball.0;
            let dy = self.color_ball.1 * self.color_ball.3 * 5 - self.color_ball.1;
            let d =
                dx * (self.color_ball.1 - self.pocket.1) - dy * (self.color_ball.0 - self.pocket.0);
            let discriminant = radius_squared * (dx * dx + dy * dy) - d * d;
            return discriminant >= 0;
        }
        false
    }
}

#[allow(non_snake_case)]
pub fn Pool(cue_ball: Ball, color_ball: Ball, pocket: Pocket) -> Pool {
    Pool {
        cue_ball,
        color_ball,
        pocket,
    }
}
