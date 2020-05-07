import React from 'react';
import formatMoney from '../lib/formatMoney';
import styled from 'styled-components';
import PropTypes from 'prop-types'

const CartItemStyles = styled.li`
`;

const CartItem = props => <CartItemStyles>
    <img width="100" src={props.cartItem.item.image} alt="" />
</CartItemStyles>;

CartItem.propTypes = {
    cartItem: PropTypes.object.isRequired
};

export default CartItem;
