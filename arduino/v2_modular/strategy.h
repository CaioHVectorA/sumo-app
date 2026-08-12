#ifndef STRATEGY_H
#define STRATEGY_H

#include "config.h"
#include "motors.h"

void strategy_init(void);
void EXECUTA_ESTRATEGIA(int EST);
void strategy_load_custom_steps(int count, StrategyStep* steps);
void update_test_mode(void);
void run_pid_battle_loop(void);

#endif // STRATEGY_H
